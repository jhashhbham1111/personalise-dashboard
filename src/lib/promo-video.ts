/**
 * The shapes, layouts and naming behind the clip recorder.
 *
 * Kept apart from the component that draws it because this is the part worth
 * being sure about — the fit arithmetic decides whether a face ends up cropped
 * at the chin, and it is far easier to check as a function than by squinting at
 * a canvas. Adapted from the Framecast recorder.
 *
 * No DOM and no `server-only`: the browser runs it while recording, and the
 * tests run it directly.
 */

export type ModeId = "portrait" | "landscape";

export const MODES: { id: ModeId; label: string; tagline: string }[] = [
  {
    id: "portrait",
    label: "Portrait",
    tagline: "9:16 — Reels, Shorts, WhatsApp Status",
  },
  {
    id: "landscape",
    label: "Desktop",
    tagline: "16:9 — YouTube, a walkthrough, a laptop screen",
  },
];

export type PromoPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  frameRate: number;
  videoBitsPerSecond: number;
};

export const PRESETS: Record<ModeId, PromoPreset[]> = {
  portrait: [
    {
      id: "reels-1080",
      label: "Reels & TikTok — 1080×1920, 30fps",
      width: 1080,
      height: 1920,
      frameRate: 30,
      videoBitsPerSecond: 8_000_000,
    },
    {
      id: "shorts-1080-60",
      label: "YouTube Shorts — 1080×1920, 60fps",
      width: 1080,
      height: 1920,
      frameRate: 60,
      videoBitsPerSecond: 10_000_000,
    },
    {
      id: "status-720",
      label: "WhatsApp Status — 720×1280, smaller file",
      width: 720,
      height: 1280,
      frameRate: 30,
      videoBitsPerSecond: 5_000_000,
    },
  ],
  landscape: [
    {
      id: "yt-1080p30",
      label: "YouTube — 1920×1080, 30fps",
      width: 1920,
      height: 1080,
      frameRate: 30,
      videoBitsPerSecond: 8_000_000,
    },
    {
      id: "yt-1080p60",
      label: "YouTube — 1920×1080, 60fps",
      width: 1920,
      height: 1080,
      frameRate: 60,
      videoBitsPerSecond: 12_000_000,
    },
    {
      id: "hd-720p30",
      label: "1280×720 — smaller file",
      width: 1280,
      height: 720,
      frameRate: 30,
      videoBitsPerSecond: 5_000_000,
    },
  ],
};

export function presetsFor(mode: ModeId): PromoPreset[] {
  return PRESETS[mode];
}

export function findPreset(mode: ModeId, id: string): PromoPreset {
  return PRESETS[mode].find((p) => p.id === id) ?? PRESETS[mode][0];
}

/* --------------------------------------------------------------- scenes */

export type LayerId =
  | "screen"
  | "screen-fill"
  | "screen-blur-bg"
  | "screen-contain"
  | "screen-top-60"
  | "cam-bottom-40"
  | "screen-70"
  | "cam-panel-30"
  | "cam-bubble"
  | "cam-only";

export type Scene = {
  id: string;
  label: string;
  description: string;
  layers: LayerId[];
  /** Whether this layout needs a screen capture to mean anything. */
  needsScreen: boolean;
};

/**
 * Layouts, per shape.
 *
 * A landscape screen inside a 9:16 frame is the whole problem this list exists
 * to solve, and there are only two honest answers: crop it to a tall slice and
 * lose most of the width, or fit the whole thing and fill the gap. Both are
 * offered because which one is right depends entirely on what is on the screen.
 */
export const SCENES: Record<ModeId, Scene[]> = {
  portrait: [
    {
      id: "cam-only",
      label: "Just me",
      description: "Camera fills the frame. The promo-clip default.",
      layers: ["cam-only"],
      needsScreen: false,
    },
    {
      id: "screen-fit-bubble",
      label: "Whole screen + me in a bubble",
      description:
        "Your screen stays complete and uncropped, with a blurred fill behind it and you in a corner.",
      layers: ["screen-blur-bg", "screen-contain", "cam-bubble"],
      needsScreen: true,
    },
    {
      id: "screen-fit",
      label: "Whole screen",
      description: "The same fit, camera off.",
      layers: ["screen-blur-bg", "screen-contain"],
      needsScreen: true,
    },
    {
      id: "screen-fill-bubble",
      label: "Screen edge-to-edge + bubble",
      description:
        "Screen cropped to fill the whole frame like a native Reel. Only a tall slice of a wide screen survives.",
      layers: ["screen-fill", "cam-bubble"],
      needsScreen: true,
    },
    {
      id: "screen-cam-split",
      label: "Screen on top, me below",
      description: "Top 60% screen, bottom 40% camera — the reaction layout.",
      layers: ["screen-top-60", "cam-bottom-40"],
      needsScreen: true,
    },
  ],
  landscape: [
    {
      id: "screen-bubble",
      label: "Screen + me in a bubble",
      description: "Full screen with a round camera bubble. The tutorial look.",
      layers: ["screen", "cam-bubble"],
      needsScreen: true,
    },
    {
      id: "screen-only",
      label: "Screen only",
      description: "Just the screen, cropped to fill 16:9.",
      layers: ["screen"],
      needsScreen: true,
    },
    {
      id: "side-by-side",
      label: "Side by side",
      description: "Screen on the left, camera panel on the right.",
      layers: ["screen-70", "cam-panel-30"],
      needsScreen: true,
    },
    {
      id: "cam-only",
      label: "Just me",
      description: "Camera only, cropped to 16:9.",
      layers: ["cam-only"],
      needsScreen: false,
    },
  ],
};

export function scenesFor(mode: ModeId): Scene[] {
  return SCENES[mode];
}

export function findScene(mode: ModeId, id: string): Scene {
  return SCENES[mode].find((s) => s.id === id) ?? SCENES[mode][0];
}

/* ------------------------------------------------------------- geometry */

/** Scale so the source covers the box, cropping the overflow. Centred. */
export function coverRect(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  if (!srcW || !srcH) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Scale so the whole source is visible inside the box, letterboxed. */
export function containRect(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  if (!srcW || !srcH) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/* -------------------------------------------------------- recording bits */

/**
 * Whether the browser can write a file as the recording runs.
 *
 * This is the difference between "record for as long as you like" and "record
 * until the tab dies". Without it the only place to put an in-progress
 * recording is an array of Blobs in memory — at 8 Mbps that is roughly 60 MB a
 * minute, so an hour-long class is several gigabytes the tab cannot hold, and
 * the failure takes the whole recording with it.
 *
 * With `showSaveFilePicker` the instructor chooses the destination up front and
 * each chunk goes straight to disk, so memory stays flat no matter how long
 * they run. Chrome and Edge on the desktop have it; Safari and Firefox do not,
 * which is why the memory path below still exists and still has a limit.
 */
export function fileStreamingSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Thirty minutes, when the file is being written to disk as it records.
 *
 * Long enough for a class, and a stop rather than a suggestion: at 8 Mbps half
 * an hour is roughly 1.8 GB, so it is worth the instructor knowing the ceiling
 * exists before they find it.
 */
export const MAX_RECORDING_SECONDS = 30 * 60;

/**
 * The much lower cap that applies *only* when the file cannot be streamed.
 *
 * Not a product decision — a memory one. Without `showSaveFilePicker` the
 * recording accumulates in the tab, and 90 seconds at 8 Mbps is about 90 MB,
 * which a phone survives. Thirty minutes there would be 1.8 GB and the tab
 * would die, losing the whole take rather than truncating it.
 */
export const MEMORY_FALLBACK_MAX_SECONDS = 90;

/** Whichever ceiling actually applies to this browser. */
export function maxRecordingSeconds(canStream: boolean): number {
  return canStream ? MAX_RECORDING_SECONDS : MEMORY_FALLBACK_MAX_SECONDS;
}

/**
 * The container to record in, best first.
 *
 * MP4 is first because it is the one every phone and every upload form accepts
 * without a conversion step. WebM is the fallback Chrome and Firefox land on,
 * and the social apps accept it — but an instructor who cannot open their own
 * clip will conclude the feature is broken, so MP4 is worth preferring.
 *
 * `isSupported` is injected so this can be checked without a browser.
 */
export function pickMimeType(
  isSupported: (mime: string) => boolean = (m) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find(isSupported) ?? "";
}

export function extensionFor(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

/** A filename the instructor can find again in a Downloads folder. */
export function promoFileName(slug: string, mime: string, at: Date = new Date()): string {
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "personalise";
  return `${safeSlug}-promo-${stamp}.${extensionFor(mime)}`;
}

/** mm:ss for the on-screen timer. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Where the caption sits, as a fraction of frame height.
 *
 * Well clear of the bottom edge in portrait: Instagram and TikTok lay their own
 * controls, caption and audio strip over the lower fifth, so text at the very
 * bottom is covered by the app it was made for.
 */
export const CAPTION_BAND: Record<ModeId, { top: number; height: number }> = {
  portrait: { top: 0.78, height: 0.13 },
  landscape: { top: 0.84, height: 0.11 },
};
