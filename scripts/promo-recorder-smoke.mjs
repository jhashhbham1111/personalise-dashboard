/**
 * Smoke test for the promo clip recorder.
 *
 * Runs the real thing: a fake camera feeds getUserMedia, the canvas composites
 * it, MediaRecorder encodes it, and the download is caught and written to disk
 * — so a pass means a playable file actually came out, not that the buttons
 * render. Chromium's --use-fake-device-for-media-stream supplies the camera;
 * without it the browser has none and the page correctly refuses to record.
 *
 *   node scripts/promo-recorder-smoke.mjs
 *
 * Expects `npm run dev` on localhost:3000 against dev.db.
 */

import { chromium } from "playwright";
import { mkdtemp, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skipFirstRunScreensEverywhere } from "./lib/signup.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch({
  args: [
    // A moving synthetic camera, and permission granted without a prompt.
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
skipFirstRunScreensEverywhere(browser);

const downloadDir = await mkdtemp(join(tmpdir(), "promo-"));

try {
  const context = await browser.newContext({ permissions: ["camera", "microphone"] });

  /*
   * Headless Chromium cannot show a native save dialog, so showSaveFilePicker
   * would reject and the streaming path could never be exercised. It is stubbed
   * with a handle that collects what is written, which is exactly what the disk
   * would do — and it lets the test assert the bytes actually arrived rather
   * than that a function was called.
   */
  await context.addInitScript(() => {
    window.__written = 0;
    window.showSaveFilePicker = async ({ suggestedName }) => ({
      name: suggestedName,
      createWritable: async () => ({
        write: async (chunk) => {
          window.__written += chunk.size ?? chunk.byteLength ?? 0;
        },
        close: async () => {},
      }),
    });
  });

  const page = await context.newPage();

  /* ------------------------------------------------- an instructor gets in */
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "ananya@personalise.app");
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

  await page.goto(`${BASE}/studio/record`, { waitUntil: "networkidle" });
  check("the record page opens for an instructor", page.url().includes("/studio/record"), page.url());

  /* -------------------------------------------------- the frame is vertical */
  const box = await page.getByTestId("promo-canvas").boundingBox();
  check("the preview frame is portrait", box.height > box.width,
    `${Math.round(box.width)}×${Math.round(box.height)}`);

  const dims = await page.getByTestId("promo-canvas").evaluate((c) => ({ w: c.width, h: c.height }));
  check("the canvas records at 1080×1920", dims.w === 1080 && dims.h === 1920, `${dims.w}×${dims.h}`);

  /* ------------------------- the camera actually reaches the composited frame */
  // A black frame would mean the pipeline is wired but nothing is flowing, which
  // is exactly the failure a screenshot-free test would miss.
  await page.waitForTimeout(1500);
  const lit = await page.getByTestId("promo-canvas").evaluate((c) => {
    const ctx = c.getContext("2d");
    const { data } = ctx.getImageData(0, 0, c.width, Math.floor(c.height * 0.6));
    let sum = 0;
    for (let i = 0; i < data.length; i += 4000) sum += data[i] + data[i + 1] + data[i + 2];
    return sum;
  });
  check("the camera image reaches the canvas", lit > 0, lit > 0 ? "non-black frame" : "frame is black");

  /* ------------------------------------------------------ record a real clip */
  await page.getByRole("button", { name: /start recording/i }).click();
  check("a countdown runs before recording", await page.getByText(/^[123]$|^Go$/).first()
    .waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false));

  await page.getByRole("button", { name: /^stop$/i }).waitFor({ state: "visible", timeout: 15000 });
  check("recording starts after the countdown", true);
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /^stop$/i }).click();

  /* ---------------------------------------------------- and it produces a file */
  const link = page.getByTestId("promo-download");
  await page.getByTestId("promo-result").waitFor({ state: "visible", timeout: 20000 });

  // No in-browser preview on this path, and that is the point: the bytes went
  // to the file as they were produced rather than being kept around to play.
  check("no preview is held in memory once it is streamed",
    (await page.getByTestId("promo-playback").count()) === 0);

  const streamedBytes = await page.evaluate(() => window.__written);
  check("the recording was written to the file as it ran", streamedBytes > 20_000,
    `${(streamedBytes / 1024).toFixed(0)} KB streamed`);

  const resultLine = await page.getByTestId("promo-result").innerText();
  check("it reports the file as already saved", /^Saved ·/.test(resultLine), resultLine);
  check("named after the instructor's page",
    /ananya-iyer-promo-.*\.(mp4|webm)/.test(resultLine), resultLine);
  check("no redundant save button for an already-saved file",
    (await link.count()) === 0);

  /* ------------------------------------------- discarding clears the result */
  await page.getByRole("button", { name: /discard/i }).click();
  check("discarding returns to a clean recorder",
    await page.getByRole("button", { name: /start recording/i }).isVisible());

  await context.close();

  /* ------------- a browser without file streaming falls back to a download */
  console.log("\nWithout showSaveFilePicker it still produces a real file");
  {
    const plain = await browser.newContext({ permissions: ["camera", "microphone"] });
    // Safari and Firefox have no File System Access API; this is that browser.
    await plain.addInitScript(() => {
      delete window.showSaveFilePicker;
    });
    const p2 = await plain.newPage();
    await p2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p2.fill('input[name="email"]', "ananya@personalise.app");
    await p2.fill('input[name="password"]', "password123");
    await p2.click('button[type="submit"]');
    await p2.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await p2.goto(`${BASE}/studio/record`, { waitUntil: "networkidle" });

    await p2.getByRole("button", { name: /start recording/i }).click();
    await p2.getByRole("button", { name: /^stop$/i }).waitFor({ state: "visible", timeout: 15000 });
    await p2.waitForTimeout(3500);
    await p2.getByRole("button", { name: /^stop$/i }).click();

    const dl = p2.getByTestId("promo-download");
    await dl.waitFor({ state: "visible", timeout: 20000 });
    check("a download is offered instead", true);

    const [download] = await Promise.all([
      p2.waitForEvent("download", { timeout: 20000 }),
      dl.click(),
    ]);
    const saved = join(downloadDir, download.suggestedFilename());
    await download.saveAs(saved);
    const info = await stat(saved);
    check("the downloaded file has real bytes", info.size > 20_000, `${(info.size / 1024).toFixed(0)} KB`);

    // Container sniff: a file that is neither is not something a phone opens.
    const head = await readFile(saved, { encoding: "latin1", flag: "r" }).then((t) => t.slice(0, 16));
    const isWebm = head.charCodeAt(0) === 0x1a && head.charCodeAt(1) === 0x45;
    const isMp4 = head.includes("ftyp");
    check("and is a real video container", isWebm || isMp4, isMp4 ? "MP4" : isWebm ? "WebM" : "unrecognised");

    const playable = await p2.getByTestId("promo-playback").evaluate(
      (v) => new Promise((res) => {
        if (v.readyState >= 1) return res(v.duration);
        v.onloadedmetadata = () => res(v.duration);
        setTimeout(() => res(-1), 8000);
      }),
    );
    check("and plays back before saving", playable === Infinity || playable > 0,
      `duration=${playable}`);
    await plain.close();
  }

  /* ----------------------- a student has no business on the recorder page */
  const student = await browser.newPage();
  await student.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await student.fill('input[name="email"]', "student@personalise.app");
  await student.fill('input[name="password"]', "password123");
  await student.click('button[type="submit"]');
  await student.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await student.goto(`${BASE}/studio/record`, { waitUntil: "networkidle" });
  check("a student is turned away from the recorder", !student.url().includes("/studio/record"),
    student.url());
  await student.close();
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
