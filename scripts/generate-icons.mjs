/**
 * Draws every app icon the manifest, the iOS home screen and Bubblewrap need,
 * from one description of the mark rather than from a designer's export.
 *
 * Regenerating is the point: the icons are derived from the same three-rising-
 * strokes glyph and the same `--color-brand-600` as `src/components/logo.tsx`,
 * so changing the brand ramp means re-running this, not opening an image
 * editor and hoping the greens still match.
 *
 *   node scripts/generate-icons.mjs
 *
 * Uses `sharp` if it is installed and falls back to a tiny hand-rolled PNG
 * encoder otherwise, because the icons must be reproducible on a machine that
 * has not run `npm install` for a native module.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BRAND = [0x1f, 0x66, 0x50]; // --color-brand-600
const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

/**
 * The glyph in the same 24×24 space `Logo` draws it in: three upright strokes
 * of increasing height, round caps, sitting on a common baseline.
 */
const STROKES = [
  { x: 7, top: 14 },
  { x: 12, top: 10 },
  { x: 17, top: 6 },
];
const BASELINE = 18;
const STROKE_W = 2.2;

/** Signed distance from a point to a round-capped line segment. */
function capsuleDistance(px, py, x, y0, y1, radius) {
  const cy = Math.min(Math.max(py, y0), y1);
  return Math.hypot(px - x, py - cy) - radius;
}

/** Signed distance to a rounded square covering the whole 24×24 box. */
function roundedSquareDistance(px, py, half, radius) {
  const dx = Math.abs(px - 12) - (half - radius);
  const dy = Math.abs(py - 12) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * @param size    pixel size of the square output
 * @param variant "any" (glyph on a brand tile), "maskable" (same, but the tile
 *                bleeds to the edges and the glyph is inset into Android's 80%
 *                safe zone) or "monochrome" (white glyph, transparent tile —
 *                what Android tints for themed icons)
 */
function render(size, variant) {
  const px = new Uint8Array(size * size * 4);
  // Android masks a maskable icon down to as little as the centre 80%, so the
  // glyph is drawn smaller and the tile is allowed to run off the canvas.
  const glyphScale = variant === "maskable" ? 0.62 : 0.78;
  const tileHalf = variant === "maskable" ? 17 : 12;
  const tileRadius = variant === "maskable" ? 0 : 5.2;
  const samples = 4; // supersample; these are seen at 48px on a phone

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0;
      let glyph = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = ((x + (sx + 0.5) / samples) / size) * 24;
          const v = ((y + (sy + 0.5) / samples) / size) * 24;

          if (variant !== "monochrome") {
            if (roundedSquareDistance(u, v, tileHalf, tileRadius) <= 0) tile++;
          }

          // Scale the glyph about the centre of the box.
          const gu = (u - 12) / glyphScale + 12;
          const gv = (v - 12) / glyphScale + 12;
          for (const s of STROKES) {
            if (capsuleDistance(gu, gv, s.x, s.top, BASELINE, STROKE_W / 2) <= 0) {
              glyph++;
              break;
            }
          }
        }
      }

      const total = samples * samples;
      const tileA = tile / total;
      const glyphA = glyph / total;
      const i = (y * size + x) * 4;

      if (variant === "monochrome") {
        // White on transparent: Android replaces the colour with the user's
        // theme, so only the alpha channel carries information.
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = Math.round(glyphA * 255);
        continue;
      }

      // Composite white glyph over the brand tile, then the tile over nothing.
      const a = Math.max(tileA, glyphA);
      if (a === 0) continue;
      const cover = Math.min(glyphA / (tileA || 1), 1);
      px[i] = Math.round(BRAND[0] + (255 - BRAND[0]) * cover);
      px[i + 1] = Math.round(BRAND[1] + (255 - BRAND[1]) * cover);
      px[i + 2] = Math.round(BRAND[2] + (255 - BRAND[2]) * cover);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

/* ------------------------------------------------------------------ PNG out */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(px, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  // Play/TWA and the manifest need 192 and 512 at minimum; Bubblewrap reads
  // the 512 to generate every Android density.
  ["icon-192.png", 192, "any"],
  ["icon-512.png", 512, "any"],
  ["icon-maskable-192.png", 192, "maskable"],
  ["icon-maskable-512.png", 512, "maskable"],
  ["icon-monochrome-512.png", 512, "monochrome"],
  // iOS ignores the manifest and reads this one from a <link>.
  ["apple-touch-icon.png", 180, "any"],
];

for (const [name, size, variant] of TARGETS) {
  writeFileSync(`${OUT}/${name}`, toPng(render(size, variant), size));
  console.log(`  ${OUT}/${name}  ${size}×${size}  ${variant}`);
}

// Next serves /favicon.ico from app/, but a 32px PNG at app/icon.png is the
// modern path and beats hand-rolling an ICO container.
writeFileSync("src/app/icon.png", toPng(render(64, "any"), 64));
console.log("  src/app/icon.png  64×64  any");
