/**
 * Draws one composed frame onto a canvas.
 *
 * This canvas is what `captureStream()` records, so nothing here is
 * decorative-only — everything drawn ends up in the exported file. Ported from
 * the Framecast compositor, with the cursor-follow pan dropped: a browser has
 * no way to read the pointer outside its own window, so there is nothing to
 * follow.
 */

import {
  CAPTION_BAND,
  containRect,
  coverRect,
  type LayerId,
  type ModeId,
  type Scene,
} from "./promo-video";

export type FrameSources = {
  screen: HTMLVideoElement | null;
  cam: HTMLVideoElement | null;
};

export type FrameOptions = {
  mode: ModeId;
  camCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  camScale: number;
  caption: { name: string; url: string } | null;
};

function hasFrame(v: HTMLVideoElement | null): v is HTMLVideoElement {
  return !!v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
}

function placeholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#151b19";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = `${Math.max(14, Math.min(w, h) * 0.05)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  empty: string,
) {
  if (!hasFrame(video)) return placeholder(ctx, x, y, w, h, empty);
  const r = coverRect(video.videoWidth, video.videoHeight, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, x + r.x, y + r.y, r.w, r.h);
  ctx.restore();
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  empty: string,
) {
  if (!hasFrame(video)) return placeholder(ctx, x, y, w, h, empty);
  const r = containRect(video.videoWidth, video.videoHeight, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, x + r.x, y + r.y, r.w, r.h);
  ctx.restore();
}

/*
 * A blurred, darkened copy of the source behind a contained one — this is what
 * lets a landscape screen sit inside a vertical frame without cropping any of
 * the actual content.
 *
 * A 36px blur across a full 1080×1920 frame every tick is by far the most
 * expensive thing here, and blur cost scales with area. So a small copy is
 * blurred and upscaled — visually identical once it is this soft — and
 * refreshed at 12fps, since an out-of-focus backdrop does not need every frame.
 */
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;
let blurLastDraw = 0;
const BLUR_BUFFER_WIDTH = 160;
const BLUR_REFRESH_FPS = 12;

function drawBlurBg(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!hasFrame(video)) {
    ctx.save();
    ctx.fillStyle = "#0d1512";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  const bw = BLUR_BUFFER_WIDTH;
  const bh = Math.max(1, Math.round(bw * (h / w)));
  if (!blurCanvas) {
    blurCanvas = document.createElement("canvas");
    blurCtx = blurCanvas.getContext("2d");
  }
  if (!blurCtx) return;
  if (blurCanvas.width !== bw || blurCanvas.height !== bh) {
    blurCanvas.width = bw;
    blurCanvas.height = bh;
    blurLastDraw = 0;
  }

  const now = performance.now();
  if (now - blurLastDraw >= 1000 / BLUR_REFRESH_FPS) {
    blurLastDraw = now;
    const r = coverRect(video.videoWidth, video.videoHeight, bw, bh);
    // 6px at 160px wide is the same relative softness as 36px at full size.
    blurCtx.filter = "blur(6px) brightness(0.5) saturate(1.15)";
    blurCtx.drawImage(video, r.x, r.y, r.w, r.h);
    blurCtx.filter = "none";
  }

  const oversize = 1.18; // hides the soft edges of the upscaled buffer
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(
    blurCanvas,
    x - (w * (oversize - 1)) / 2,
    y - (h * (oversize - 1)) / 2,
    w * oversize,
    h * oversize,
  );
  ctx.restore();
}

/**
 * The camera bubble, in a chosen corner.
 *
 * `safeInset` in portrait pushes it clear of the bands where Reels, TikTok and
 * Shorts paint their own controls, so "bottom-right" does not quietly mean
 * "underneath the like button".
 */
function drawCamBubble(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  W: number,
  H: number,
  opts: FrameOptions,
) {
  const size = Math.min(W, H) * (opts.camScale || 0.3);
  const margin = Math.min(W, H) * 0.045;
  const safe = opts.mode === "portrait";
  const marginTop = safe ? Math.max(margin, H * 0.1) : margin;
  const marginBottom = safe ? Math.max(margin, H * 0.26) : margin;

  const xLeft = margin + size / 2;
  const xRight = W - margin - size / 2;
  const yTop = marginTop + size / 2;
  const yBottom = H - marginBottom - size / 2;

  const corners: Record<string, [number, number]> = {
    "top-left": [xLeft, yTop],
    "top-right": [xRight, yTop],
    "bottom-left": [xLeft, yBottom],
    "bottom-right": [xRight, yBottom],
  };
  const [cx, cy] = corners[opts.camCorner] ?? corners["bottom-right"];

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#151b19";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (hasFrame(video)) {
    const r = coverRect(video.videoWidth, video.videoHeight, size, size);
    ctx.drawImage(video, cx - size / 2 + r.x, cy - size / 2 + r.y, r.w, r.h);
  } else {
    ctx.fillStyle = "#151b19";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, size * 0.02);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: LayerId,
  W: number,
  H: number,
  src: FrameSources,
  opts: FrameOptions,
) {
  const NO_SCREEN = "Choose what to share";
  const NO_CAM = "Camera off";

  switch (layer) {
    case "screen":
    case "screen-fill":
      drawCover(ctx, src.screen, 0, 0, W, H, NO_SCREEN);
      break;
    case "screen-blur-bg":
      drawBlurBg(ctx, src.screen, 0, 0, W, H);
      break;
    case "screen-contain":
      drawContain(ctx, src.screen, 0, 0, W, H, NO_SCREEN);
      break;
    case "screen-top-60":
      drawCover(ctx, src.screen, 0, 0, W, H * 0.6, NO_SCREEN);
      break;
    case "cam-bottom-40":
      drawCover(ctx, src.cam, 0, H * 0.6, W, H * 0.4, NO_CAM);
      break;
    case "screen-70":
      drawCover(ctx, src.screen, 0, 0, W * 0.7, H, NO_SCREEN);
      break;
    case "cam-panel-30":
      drawCover(ctx, src.cam, W * 0.7, 0, W * 0.3, H, NO_CAM);
      break;
    case "cam-bubble":
      drawCamBubble(ctx, src.cam, W, H, opts);
      break;
    case "cam-only":
      drawCover(ctx, src.cam, 0, 0, W, H, NO_CAM);
      break;
  }
}

/**
 * The caption, drawn last so no layer can cover it.
 *
 * The scrim runs to the bottom edge on purpose: ending it just below the text
 * left a hard horizontal line across the frame where the darkening stopped,
 * which reads as a rendering fault rather than as shading.
 */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: FrameOptions,
) {
  if (!opts.caption) return;
  const band = CAPTION_BAND[opts.mode];
  const bandTop = H * band.top;
  const bandH = H * band.height;
  const scrimTop = bandTop - bandH * 0.6;

  const grad = ctx.createLinearGradient(0, scrimTop, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0.66)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);

  // Sized off the short edge, so the same text reads at the same physical size
  // whether the frame is 1080 wide or 1920.
  const unit = Math.min(W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(unit * 0.058)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(opts.caption.name, W / 2, bandTop + bandH * 0.42, W * 0.9);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `500 ${Math.round(unit * 0.036)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(opts.caption.url, W / 2, bandTop + bandH * 0.86, W * 0.9);
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: Scene,
  src: FrameSources,
  opts: FrameOptions,
) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d1512";
  ctx.fillRect(0, 0, W, H);
  for (const layer of scene.layers) drawLayer(ctx, layer, W, H, src, opts);
  ctx.restore();
  drawCaption(ctx, W, H, opts);
}
