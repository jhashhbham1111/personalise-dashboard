"use client";

/**
 * Client-side video compression, keeping every upload near COMPRESSION_TARGET_BYTES.
 * Runs entirely in the browser via the WebCodecs API (through the mediabunny
 * toolkit) — nothing crosses the network at its original size, a 40 MB clip
 * is transcoded down to a target size locally, and only the result is
 * uploaded.
 *
 * Deliberately has no fallback path (no ffmpeg.wasm, no server-side step).
 * isCompressionSupported() probes the exact codecs we'd encode with, and the
 * caller (VideoUpload) rejects the file outright with a clear message when
 * it comes back false, rather than attempting a degraded encode.
 *
 * The target is intentionally tight (10 MB) — this app only expects short
 * clips (vlogs, technique snippets), never full class recordings, so a small
 * target keeps storage/bandwidth down without the quality floor mattering
 * much for a clip that's a minute or two long. A clip long enough that even
 * MIN_VIDEO_BITRATE can't hit the target will still get rejected by the
 * caller's post-compression size check rather than silently shipping an
 * oversized or unwatchably-low-quality file.
 */

export const COMPRESSION_TARGET_BYTES = 10 * 1024 * 1024;
const AUDIO_BITRATE = 96_000;
const MIN_VIDEO_BITRATE = 250_000;
const MAX_VIDEO_BITRATE = 4_000_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// H.264 encoders want even dimensions.
function evenify(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

// Only ever downscales. Caps the long side based on the bitrate we're about
// to spend, so a low bitrate isn't spread across a resolution too high to
// read as anything but noise.
function targetDimensions(width: number, height: number, videoBitrate: number) {
  const longSide = Math.max(width, height);
  const cap = videoBitrate < 1_000_000 ? 854 : videoBitrate < 2_500_000 ? 1280 : 1920;
  if (longSide <= cap) return { width: evenify(width), height: evenify(height) };
  const scale = cap / longSide;
  return { width: evenify(width * scale), height: evenify(height * scale) };
}

/**
 * Checks whether this browser can actually encode H.264 video + AAC audio
 * through WebCodecs — not just whether the VideoEncoder class exists. Some
 * browsers (older iOS Safari in particular) expose WebCodecs classes with
 * only partial support: decode without encode, or video encode without
 * audio encode.
 */
export async function isCompressionSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !("VideoEncoder" in window)) return false;
  try {
    const { canEncodeVideo, canEncodeAudio } = await import("mediabunny");
    const [video, audio] = await Promise.all([
      canEncodeVideo("avc", { width: 1280, height: 720, bitrate: 2_000_000 }),
      canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 44100, bitrate: AUDIO_BITRATE }),
    ]);
    return video && audio;
  } catch {
    return false;
  }
}

/**
 * Transcodes a video file down toward COMPRESSION_TARGET_BYTES and returns
 * the result as a new File (MP4, H.264 + AAC). Call isCompressionSupported()
 * first — this throws rather than degrading if the browser can't encode.
 */
export async function compressVideo(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat } =
    await import("mediabunny");

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  const [duration, videoTrack, audioTrack] = await Promise.all([
    input.computeDuration(),
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ]);

  if (!videoTrack || !duration || duration <= 0) {
    throw new Error("Couldn't read that video file.");
  }

  const [width, height] = await Promise.all([
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
  ]);

  // Split the byte budget between audio and video, then work out a video
  // bitrate that should land the whole file near COMPRESSION_TARGET_BYTES.
  const audioBudget = audioTrack ? AUDIO_BITRATE * duration : 0;
  // mediabunny requires an integer bitrate — a bare division here is a float
  // and Conversion.init() rejects it outright ("must be a positive integer
  // or a quality").
  const videoBitrate = Math.round(
    clamp(
      (COMPRESSION_TARGET_BYTES * 8 - audioBudget) / duration,
      MIN_VIDEO_BITRATE,
      MAX_VIDEO_BITRATE,
    ),
  );
  const { width: outWidth, height: outHeight } = targetDimensions(width, height, videoBitrate);

  const bufferTarget = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target: bufferTarget });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      width: outWidth,
      height: outHeight,
      fit: "fill",
      codec: "avc",
      bitrate: videoBitrate,
    },
    audio: { codec: "aac", bitrate: AUDIO_BITRATE },
  });

  if (!conversion.isValid) {
    throw new Error("This video can't be compressed in your browser.");
  }

  if (onProgress) conversion.onProgress = (ratio) => onProgress(ratio);

  await conversion.execute();

  if (!bufferTarget.buffer) {
    throw new Error("Compression finished without producing a file.");
  }

  const name = file.name.replace(/\.[^/.]+$/, "") + "-compressed.mp4";
  return new File([bufferTarget.buffer], name, { type: "video/mp4" });
}
