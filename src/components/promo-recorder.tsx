"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Circle, Download, MonitorUp, RotateCcw, Square, Video } from "lucide-react";

import {
  MODES,
  type ModeId,
  extensionFor,
  findPreset,
  findScene,
  fileStreamingSupported,
  MAX_RECORDING_SECONDS,
  formatTimer,
  maxRecordingSeconds,
  pickMimeType,
  presetsFor,
  promoFileName,
  scenesFor,
} from "@/lib/promo-video";
import { drawFrame } from "@/lib/promo-compositor";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";

type Phase = "idle" | "counting" | "recording" | "done";
type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Screen capture is desktop-only and there is no polyfill.
 *
 * iOS Safari has no getDisplayMedia at all and Android Chrome will not share a
 * screen from a tab, so on a phone the screen layouts are not "broken", they
 * are impossible — offering them there would be a button that can only ever
 * fail. Camera recording works everywhere, which is why it stays the default.
 */
function screenCaptureSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

/** Nothing external ever changes this, so the subscription is a no-op. */
const noopSubscribe = () => () => {};

export function PromoRecorder({
  instructorName,
  bookingUrl,
  slug,
}: {
  instructorName: string;
  bookingUrl: string;
  slug: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camElRef = useRef<HTMLVideoElement | null>(null);
  const screenElRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /*
   * The open file, when the browser can stream to disk. Writes are chained
   * through `writeQueueRef` because MediaRecorder does not await
   * `ondataavailable` — firing off overlapping writes on one stream throws.
   */
  const writableRef = useRef<FileSystemWritableFileStream | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const savedNameRef = useRef<string>("");
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<ModeId>("portrait");
  const [presetId, setPresetId] = useState(presetsFor("portrait")[0].id);
  const [sceneId, setSceneId] = useState(scenesFor("portrait")[0].id);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [camCorner, setCamCorner] = useState<Corner>("bottom-right");
  const [showCaption, setShowCaption] = useState(true);
  const [hasScreen, setHasScreen] = useState(false);
  /*
   * The server has no `navigator`, so this has to answer differently on each
   * side without a hydration mismatch — which is what useSyncExternalStore is
   * for, and what SplashScreen already uses for the same gap. An effect would
   * work too but costs a second render on mount to say something that was
   * knowable the moment the client had a DOM.
   */
  const canShareScreen = useSyncExternalStore(
    noopSubscribe,
    screenCaptureSupported,
    () => false,
  );
  const canStreamToDisk = useSyncExternalStore(
    noopSubscribe,
    fileStreamingSupported,
    () => false,
  );
  const capSeconds = maxRecordingSeconds(canStreamToDisk);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [result, setResult] = useState<{ url: string; name: string; bytes: number } | null>(
    null,
  );

  const preset = findPreset(mode, presetId);
  const scene = findScene(mode, sceneId);


  /* ------------------------------------------------------------- camera */

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : // Only an ideal: a laptop webcam cannot produce 9:16 and would
            // reject an exact constraint outright, leaving no camera at all.
            { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      camStreamRef.current = stream;

      if (!camElRef.current) {
        const el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        camElRef.current = el;
      }
      camElRef.current.srcObject = stream;
      await camElRef.current.play().catch(() => {});

      // Labels are blank until permission is granted, so the device list is
      // only worth reading after getUserMedia has resolved once.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameras(cams);
      if (!deviceId && cams[0]?.deviceId) setCameraId(cams[0].deviceId);
      setError(null);
    } catch {
      setError(
        "No camera available. Allow camera access in your browser, then reload this page.",
      );
    }
  }, []);

  useEffect(() => {
    /*
     * Opening the camera is the one thing an effect is unambiguously for —
     * synchronising with an external system on mount and tearing it down on
     * unmount. The rule fires because it follows `startCamera` and finds
     * setState inside it, but every one of those runs in an async continuation
     * after an `await`, not synchronously in this body.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startCamera]);

  /* -------------------------------------------------------------- screen */

  const pickScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        // Chrome offers tab audio here; macOS cannot give system audio at all,
        // so this is a bonus where it exists rather than something promised.
        audio: false,
      });
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = stream;

      if (!screenElRef.current) {
        const el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        screenElRef.current = el;
      }
      screenElRef.current.srcObject = stream;
      await screenElRef.current.play().catch(() => {});
      setHasScreen(true);
      setError(null);

      // Chrome's own "Stop sharing" bar ends the track behind our back; without
      // this the layout keeps showing a frozen last frame as though it were live.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setHasScreen(false);
        screenStreamRef.current = null;
      });
    } catch {
      // Cancelling the picker is a normal thing to do, not an error worth
      // shouting about — the only signal needed is that nothing changed.
    }
  }, []);

  /* ------------------------------------------------- the composited frame */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const opts = {
      mode,
      camCorner,
      camScale: 0.3,
      caption: showCaption ? { name: instructorName, url: bookingUrl } : null,
    };
    const tick = () => {
      if (!running) return;
      drawFrame(ctx, canvas.width, canvas.height, scene, {
        cam: camElRef.current,
        screen: screenElRef.current,
      }, opts);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [preset.width, preset.height, scene, mode, camCorner, showCaption, instructorName, bookingUrl]);

  /* ---------------------------------------------------------- recording */

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const beginRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const captured = canvas.captureStream(preset.frameRate);
    const videoTrack = captured.getVideoTracks()[0];
    const audioTrack = camStreamRef.current?.getAudioTracks()[0];
    const stream = new MediaStream(audioTrack ? [videoTrack, audioTrack] : [videoTrack]);

    const mimeType = pickMimeType();
    const type = mimeType || "video/webm";
    chunksRef.current = [];
    const writable = writableRef.current;
    let written = 0;

    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: preset.videoBitsPerSecond,
    });

    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      if (writable) {
        written += e.data.size;
        /*
         * Chained rather than awaited: MediaRecorder fires this without
         * waiting, and two overlapping writes to one FileSystemWritableFile
         * throw. Queueing keeps them in order and keeps memory flat — the
         * chunk is handed to the disk and dropped, which is the whole reason
         * a recording can now run for an hour.
         */
        writeQueueRef.current = writeQueueRef.current
          .then(() => writable.write(e.data))
          .catch(() => {
            setError("Writing to the file failed — the recording was stopped.");
            if (recorderRef.current?.state === "recording") recorderRef.current.stop();
          });
      } else {
        chunksRef.current.push(e.data);
      }
    };

    rec.onstop = () => {
      if (writable) {
        // The file is already on disk; all that is left is to flush and close.
        writeQueueRef.current = writeQueueRef.current
          .then(() => writable.close())
          .then(() => {
            writableRef.current = null;
            setResult({ url: "", name: savedNameRef.current, bytes: written });
            setPhase("done");
          })
          .catch(() => {
            setError("The recording could not be finished off on disk.");
            setPhase("idle");
          });
        return;
      }

      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setResult({
        url: URL.createObjectURL(blob),
        name: promoFileName(slug, type),
        bytes: blob.size,
      });
      setPhase("done");
    };

    recorderRef.current = rec;
    // Timeslice, so each second is handed over as it is produced rather than
    // held in one un-flushed buffer until the end.
    rec.start(1000);
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
  }, [preset.frameRate, preset.videoBitsPerSecond, slug]);

  /**
   * Ask where the file should go, before anything is recorded.
   *
   * The picker needs the user gesture that started the recording, so it runs on
   * the click rather than after the countdown. Choosing the destination first
   * is also the thing that makes an unlimited recording safe: every chunk goes
   * straight there instead of piling up in the tab.
   */
  const openDestination = useCallback(async (): Promise<boolean> => {
    if (!fileStreamingSupported()) return true; // memory path, capped below
    const type = pickMimeType() || "video/webm";
    const name = promoFileName(slug, type);
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (o: unknown) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: extensionFor(type) === "mp4" ? "MP4 video" : "WebM video",
            accept: { [type.split(";")[0]]: [`.${extensionFor(type)}`] },
          },
        ],
      });
      writableRef.current = await handle.createWritable();
      writeQueueRef.current = Promise.resolve();
      savedNameRef.current = handle.name || name;
      return true;
    } catch {
      // Cancelling the save dialog means "not now", not an error.
      return false;
    }
  }, [slug]);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= capSeconds * 1000) stopRecording();
    }, 200);
    return () => clearInterval(id);
  }, [phase, stopRecording, capSeconds]);

  // Three seconds to put the phone down and step back, which is the difference
  // between a clip that opens on a face and one that opens on a hand reaching
  // for a button.
  useEffect(() => {
    if (phase !== "counting") return;
    if (countdown <= 0) {
      beginRecording();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown, beginRecording]);

  const changeMode = (next: ModeId) => {
    setMode(next);
    setPresetId(presetsFor(next)[0].id);
    // Layouts are per-shape, so the old id usually means nothing here; findScene
    // falls back, but setting it explicitly keeps the picker honest.
    setSceneId(scenesFor(next)[0].id);
  };

  const reset = () => {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setElapsed(0);
    setPhase("idle");
  };

  const remaining = Math.max(0, capSeconds * 1000 - elapsed);
  const busy = phase === "recording" || phase === "counting";
  const visibleScenes = scenesFor(mode).filter((s) => canShareScreen || !s.needsScreen);
  const needsScreenNow = scene.needsScreen && !hasScreen;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div>
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          <canvas
            ref={canvasRef}
            data-testid="promo-canvas"
            className="block h-auto w-full"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          />

          {phase === "counting" ? (
            <div className="absolute inset-0 grid place-items-center bg-black/45">
              <span className="text-7xl font-semibold text-white">
                {countdown === 0 ? "Go" : countdown}
              </span>
            </div>
          ) : null}

          {phase === "recording" ? (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-red-500" />
              <span className="font-mono text-sm text-white">{formatTimer(elapsed)}</span>
              <span className="text-xs text-white/60">{formatTimer(remaining)} left</span>
            </div>
          ) : null}
        </div>

        {/* Only when there is something to play: a streamed recording went
            straight to disk, and an empty src renders a broken player. */}
        {result?.url ? (
          <video
            src={result.url}
            controls
            playsInline
            data-testid="promo-playback"
            className="mt-3 w-full rounded-xl border border-line bg-black"
          />
        ) : null}
      </div>

      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Card className="space-y-4 p-5">
          {/* Shape first: it decides which layouts and sizes even make sense. */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Shape</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode(m.id)}
                  aria-pressed={mode === m.id}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                    mode === m.id
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                      : "border-line-strong bg-surface hover:border-brand-200",
                  )}
                >
                  <span className="block text-sm font-medium text-ink">{m.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{m.tagline}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Layout" htmlFor="scene">
            <Select
              id="scene"
              value={sceneId}
              disabled={busy}
              onChange={(e) => setSceneId(e.target.value)}
            >
              {visibleScenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="-mt-2 text-xs text-ink-soft">{scene.description}</p>

          <Field label="Size" htmlFor="preset">
            <Select
              id="preset"
              value={presetId}
              disabled={busy}
              onChange={(e) => setPresetId(e.target.value)}
            >
              {presetsFor(mode).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          {cameras.length > 1 ? (
            <Field label="Camera" htmlFor="camera">
              <Select
                id="camera"
                value={cameraId}
                disabled={busy}
                onChange={(e) => {
                  setCameraId(e.target.value);
                  startCamera(e.target.value);
                }}
              >
                {cameras.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {scene.layers.includes("cam-bubble") ? (
            <Field label="Bubble corner" htmlFor="corner">
              <Select
                id="corner"
                value={camCorner}
                disabled={busy}
                onChange={(e) => setCamCorner(e.target.value as Corner)}
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </Select>
            </Field>
          ) : null}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={showCaption}
              disabled={busy}
              onChange={(e) => setShowCaption(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--color-brand-600)]"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Put my name and page link on the clip
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                Burned into the video, so it survives being reshared.
              </span>
            </span>
          </label>
        </Card>

        {/* Only shown where it can work — see screenCaptureSupported. */}
        {canShareScreen && scene.needsScreen ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={pickScreen} disabled={busy}>
              <MonitorUp className="h-4 w-4" />
              {hasScreen ? "Change what's shared" : "Choose what to share"}
            </Button>
            {hasScreen ? (
              <span className="text-xs text-ink-soft">Sharing — it appears in the frame.</span>
            ) : null}
          </div>
        ) : null}

        {!canShareScreen ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            Screen sharing needs a desktop browser, so only the camera layouts
            are shown here. Open this page on a laptop to record your screen.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {phase === "idle" || phase === "done" ? (
            <Button
              size="lg"
              onClick={async () => {
                reset();
                // Where the file goes is settled first: the picker needs this
                // click's user gesture, and a cancelled dialog should stop
                // here rather than after a three-second countdown.
                if (!(await openDestination())) return;
                setCountdown(3);
                setPhase("counting");
              }}
              disabled={!!error || needsScreenNow}
            >
              <Circle className="h-4 w-4 fill-current" />
              {phase === "done" ? "Record another" : "Start recording"}
            </Button>
          ) : null}

          {phase === "recording" ? (
            <Button size="lg" variant="secondary" onClick={stopRecording}>
              <Square className="h-4 w-4 fill-current" />
              Stop
            </Button>
          ) : null}

          {result ? (
            <>
              {/* Streamed recordings are already on disk — offering "save" for
                  a file that has been saved for the last half hour would be a
                  button that does nothing. */}
              {result.url ? (
                <a
                  href={result.url}
                  download={result.name}
                  data-testid="promo-download"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  <Download className="h-4 w-4" />
                  Save to my device
                </a>
              ) : null}
              <Button variant="ghost" size="lg" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Discard
              </Button>
            </>
          ) : null}
        </div>

        {needsScreenNow ? (
          <p className="text-sm text-ink-soft">
            This layout needs a screen — choose what to share before recording.
          </p>
        ) : null}

        {result ? (
          <p className="text-sm text-ink-soft" data-testid="promo-result">
            {result.url ? "" : "Saved · "}
            {result.name} · {(result.bytes / 1_048_576).toFixed(1)} MB ·{" "}
            {extensionFor(result.name).toUpperCase()}
          </p>
        ) : (
          <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            <Video className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {canStreamToDisk
                ? `Up to ${capSeconds / 60} minutes. You choose the file first and it is written there as you record, so nothing is uploaded and a long recording can't fill up the tab.`
                : `Up to ${capSeconds} seconds in this browser, which holds the recording in memory until you save it. Chrome or Edge on a laptop writes straight to a file and allows ${MAX_RECORDING_SECONDS / 60} minutes.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
