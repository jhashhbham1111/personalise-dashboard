"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type UploadFolder = "avatars" | "covers";

/**
 * An image picker that uploads immediately on selection and stores the
 * resulting Cloudinary URL in a hidden form input.
 *
 * The component is intentionally self-contained: it handles the
 * upload XHR itself rather than delegating to a server action so the
 * user sees a progress state without a full form submit.
 */
export function ImageUpload({
  name,
  folder,
  defaultUrl,
  label,
  shape = "square",
  className,
}: {
  /** Hidden input name — whatever the server action reads. */
  name: string;
  folder: UploadFolder;
  /** Existing URL to pre-populate (can be undefined for a new record). */
  defaultUrl?: string | null;
  label?: string;
  /** "square" for avatars, "wide" for cover images. */
  shape?: "square" | "wide";
  className?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setUrl(json.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const isWide = shape === "wide";

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <p className="text-sm font-medium text-ink">{label}</p>
      ) : null}

      {/* Hidden input carries the URL for the server action */}
      <input type="hidden" name={name} value={url} />

      {/* File input (hidden — triggered by the clickable area) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-canvas transition-colors hover:border-brand-400 cursor-pointer",
          isWide ? "w-full" : "w-28",
        )}
        style={{ height: isWide ? "9rem" : "7rem" }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={label ?? "Upload image"}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        {url ? (
          <Image
            src={url}
            alt={label ?? "Uploaded image"}
            fill
            className="object-cover"
            sizes={isWide ? "600px" : "112px"}
          />
        ) : null}

        {/* Overlay */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 transition-opacity",
            url && !uploading ? "opacity-0 hover:opacity-100" : "opacity-100",
          )}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : (
            <>
              <Camera className="h-6 w-6 text-white" />
              <span className="text-xs font-medium text-white">
                {url ? "Change" : "Upload"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Remove button */}
      {url && !uploading ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setUrl("");
          }}
          className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-danger-600"
        >
          <X className="h-3.5 w-3.5" />
          Remove
        </button>
      ) : null}

      {error ? <p className="text-xs text-danger-700">{error}</p> : null}
      <p className="text-xs text-ink-faint">JPG, PNG or WebP · max 5 MB</p>
    </div>
  );
}
