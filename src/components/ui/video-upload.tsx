"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Film, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COMPRESSION_TARGET_BYTES,
  compressVideo,
  isCompressionSupported,
} from "@/lib/video-compress";

// Anything at or under the compression target uploads as-is — no point
// spending CPU/battery re-encoding a file that's already small.
const UPLOAD_AS_IS_BYTES = COMPRESSION_TARGET_BYTES;

// Beyond this we don't even attempt an in-browser compression pass. This app
// only expects short clips, so a file this large is almost certainly the
// wrong file rather than something worth grinding through a slow transcode
// for.
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

// Tolerance over the target we'll still accept as "close enough" — bitrate
// targets are averages an encoder aims for, not hard ceilings.
const COMPRESSED_CEILING_BYTES = COMPRESSION_TARGET_BYTES * 1.2;

type SignatureResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
};

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * A video picker that uploads straight from the browser to Cloudinary.
 *
 * Deliberately not routed through our own /api/upload the way images are —
 * see the comment on signVideoUpload() in src/lib/cloudinary.ts. Our server
 * only ever sees a signature request (tiny JSON) and never the file itself.
 */
export function VideoUpload({
  urlName,
  thumbnailName,
  durationName,
  defaultUrl,
  defaultThumbnailUrl,
  defaultDurationSec,
  className,
  onBusyChange,
}: {
  /** Hidden input names — whatever saveVideoAction reads. */
  urlName: string;
  thumbnailName: string;
  durationName: string;
  defaultUrl?: string | null;
  defaultThumbnailUrl?: string | null;
  defaultDurationSec?: number | null;
  className?: string;
  /**
   * Fires whenever compression or upload starts/stops, so the parent form
   * can hold its submit button disabled — the hidden url input is empty
   * until one of those finishes, and submitting early used to fail with a
   * confusing "Paste a full video URL" error instead of just waiting.
   */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(defaultThumbnailUrl ?? "");
  const [durationSec, setDurationSec] = useState(defaultDurationSec ?? null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onBusyChange?.(compressing || uploading);
    // Only the busy state itself should retrigger this — including
    // onBusyChange would refire on every parent render since inline
    // callbacks aren't stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compressing, uploading]);

  async function handleFile(file: File) {
    setError("");

    if (!file.type.startsWith("video/")) {
      setError("That's not a video file.");
      return;
    }

    let uploadFile = file;

    if (file.size > MAX_INPUT_BYTES) {
      setError(
        `That file is ${formatBytes(file.size)} — please add a smaller file (up to ${formatBytes(MAX_INPUT_BYTES)}; we compress it down to about ${formatBytes(COMPRESSION_TARGET_BYTES)} automatically).`,
      );
      return;
    }

    if (file.size > UPLOAD_AS_IS_BYTES) {
      if (!(await isCompressionSupported())) {
        setError(
          `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(UPLOAD_AS_IS_BYTES)}, and your browser can't compress video automatically. Try a shorter clip, compress it before uploading, or paste a link instead.`,
        );
        return;
      }

      setFileName(file.name);
      setCompressing(true);
      setCompressProgress(0);
      try {
        uploadFile = await compressVideo(file, (ratio) =>
          setCompressProgress(Math.round(ratio * 100)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't compress that video.");
        setCompressing(false);
        setFileName("");
        return;
      }
      setCompressing(false);

      if (uploadFile.size > COMPRESSED_CEILING_BYTES) {
        setError(
          `Even compressed, that came out to ${formatBytes(uploadFile.size)} — still over our ${formatBytes(COMPRESSION_TARGET_BYTES)} target. Try a shorter clip.`,
        );
        setFileName("");
        return;
      }
    }

    setUploading(true);
    setProgress(0);
    setFileName(file.name);

    try {
      const sigRes = await fetch("/api/upload/video-signature", { method: "POST" });
      const sig = (await sigRes.json()) as SignatureResponse | { error: string };
      if (!sigRes.ok) throw new Error("error" in sig ? sig.error : "Couldn't start the upload.");
      const params = sig as SignatureResponse;

      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("api_key", params.apiKey);
      fd.append("timestamp", String(params.timestamp));
      fd.append("signature", params.signature);
      fd.append("folder", params.folder);
      fd.append("public_id", params.publicId);

      const result = await new Promise<{ secure_url: string; duration?: number }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `https://api.cloudinary.com/v1_1/${params.cloudName}/video/upload`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            try {
              const body = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300) resolve(body);
              else reject(new Error(body?.error?.message ?? "Upload failed."));
            } catch {
              reject(new Error("Upload failed."));
            }
          };
          xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
          xhr.send(fd);
        },
      );

      setUrl(result.secure_url);
      // Cloudinary generates this frame automatically for any video it
      // hosts; requesting the same public id back as a .jpg is the
      // documented way to fetch it, not a guess at internal behaviour.
      setThumbnailUrl(`https://res.cloudinary.com/${params.cloudName}/video/upload/${params.publicId}.jpg`);
      setDurationSec(result.duration ? Math.round(result.duration) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setFileName("");
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setUrl("");
    setThumbnailUrl("");
    setDurationSec(null);
    setFileName("");
    setError("");
    setCompressing(false);
    setCompressProgress(0);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <input type="hidden" name={urlName} value={url} />
      <input type="hidden" name={thumbnailName} value={thumbnailUrl} />
      <input type="hidden" name={durationName} value={durationSec ?? ""} />

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "relative flex min-h-[7rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center transition-colors",
          error
            ? "border-danger-500 bg-danger-100"
            : "border-line-strong bg-canvas hover:border-brand-400 cursor-pointer",
        )}
        onClick={() => !uploading && !compressing && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload a video"
        onKeyDown={(e) =>
          e.key === "Enter" && !uploading && !compressing && inputRef.current?.click()
        }
      >
        {compressing ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            <p className="text-sm font-medium text-ink">Compressing {fileName}…</p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${compressProgress}%` }}
              />
            </div>
            <p className="text-xs text-ink-faint">
              {compressProgress}% · shrinking this down to about {formatBytes(COMPRESSION_TARGET_BYTES)}
            </p>
          </>
        ) : uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            <p className="text-sm font-medium text-ink">Uploading {fileName}…</p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-ink-faint">{progress}%</p>
          </>
        ) : url ? (
          <>
            <CheckCircle2 className="h-6 w-6 text-brand-600" />
            <p className="max-w-full truncate text-sm font-medium text-ink">
              {fileName || "Video uploaded"}
            </p>
            {durationSec ? (
              <p className="text-xs text-ink-faint">{formatDuration(durationSec)}</p>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-danger-600"
            >
              <X className="h-3.5 w-3.5" />
              Remove, upload a different file
            </button>
          </>
        ) : (
          <>
            <Film className="h-6 w-6 text-ink-faint" />
            <p className="text-sm font-medium text-ink">
              Tap to choose a video, or drag one here
            </p>
            <p className="text-xs text-ink-faint">
              MP4, MOV or WebM · up to {formatBytes(UPLOAD_AS_IS_BYTES)} uploads as-is, up to{" "}
              {formatBytes(MAX_INPUT_BYTES)} is compressed automatically
            </p>
          </>
        )}
      </div>

      {error ? <p className="text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}
