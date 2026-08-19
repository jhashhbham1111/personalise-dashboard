/**
 * Live class room smoke test.
 *
 * Exercises /live/[sessionId] end to end against the mock provider: an
 * instructor starting a class, a student joining it, chat, hand raise,
 * host mute, recording start/stop (which should create a real VideoAsset),
 * and ending the class (which should finalize attendance).
 *
 * Requires a session whose join window is currently open — point
 * LIVE_SESSION_ID at one (see the inline note in the delivery message for
 * how to shift a seeded session's time to "now").
 *
 * Run with the server already listening on BASE_URL:
 *   LIVE_SESSION_ID=<id> node scripts/live-smoke.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SESSION_ID = process.env.LIVE_SESSION_ID;
const SHOTS = "screenshots/live";
mkdirSync(SHOTS, { recursive: true });

if (!SESSION_ID) {
  console.error("Set LIVE_SESSION_ID to a session id whose join window is open.");
  process.exit(1);
}

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

try {
  /* -------------------------------------------------------------- host */
  const hostCtx = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: [] });
  const host = hostCtx;
  await login(host, "ananya@personalise.app");

  await host.goto(`${BASE}/live/${SESSION_ID}`, { waitUntil: "domcontentloaded" });
  await host.waitForSelector("text=Setting up your camera", { timeout: 5000 }).catch(() => {});
  await host.waitForSelector("text=/^Live$/", { timeout: 15000 });
  check("host: room loads and shows LIVE badge", true);
  await shot(host, "01-host-room");

  check(
    "host: local video tile rendered",
    (await host.locator("video, span:has-text('A')").first().isVisible().catch(() => false)) ||
      (await host.getByText(/you\)/i).first().isVisible().catch(() => false)),
  );

  // Simulated peer (the enrolled student) should join after a short delay.
  await host.waitForTimeout(3500);
  const peerTileVisible = await host.getByText("Meera Krishnan").first().isVisible().catch(() => false);
  check("host: simulated peer tile appears", peerTileVisible);
  await shot(host, "02-host-peer-joined");

  // Chat.
  await host.getByRole("button", { name: "Chat" }).click();
  const peerJoinSystemMsg = await host.getByText(/joined the class/i).first().isVisible().catch(() => false);
  check("host: chat panel shows peer-joined system message", peerJoinSystemMsg);
  await host.getByPlaceholder("Say something…").fill("Welcome everyone, let's begin.");
  await host.getByRole("button", { name: "Send" }).click();
  check(
    "host: sent chat message appears",
    await host.getByText("Welcome everyone, let's begin.").isVisible().catch(() => false),
  );
  await shot(host, "03-host-chat");

  // Hand raise toggle.
  await host.getByRole("button", { name: "Raise hand" }).click();
  check(
    "host: hand raise system message appears",
    await host.getByText(/raised a hand/i).isVisible().catch(() => false),
  );

  // People panel + mute a simulated peer.
  await host.getByRole("button", { name: "People" }).click();
  await shot(host, "04-host-people-panel");
  const muteButtons = host.getByTitle("Mute");
  const muteCount = await muteButtons.count();
  if (muteCount > 0) {
    await muteButtons.first().click();
    check("host: mute-participant control present and clickable", true);
  } else {
    check("host: mute-participant control present and clickable", false, "no peer rows found");
  }

  // Recording.
  await host.getByRole("button", { name: "Start recording" }).click();
  check(
    "host: recording indicator appears",
    await host.getByText("Recording").isVisible().catch(() => false),
  );
  await host.waitForTimeout(600);
  await host.getByRole("button", { name: "Stop recording" }).click();
  await host.waitForTimeout(600);

  /* ---------------------------------------------------------- student */
  const studentCtx = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const student = studentCtx;
  await login(student, "student@personalise.app");
  await student.goto(`${BASE}/live/${SESSION_ID}`, { waitUntil: "domcontentloaded" });
  await student.waitForSelector("text=/^Live$/", { timeout: 15000 });
  check("student: room loads for a confirmed booking", true);
  await shot(student, "05-student-room");

  /* -------------------------------------------------------- end class */
  await host.getByRole("button", { name: "End class" }).click();
  await host.getByRole("button", { name: "End class" }).click(); // confirm
  const ended = await host.getByText(/class ended/i).isVisible({ timeout: 5000 }).catch(() => false);
  check("host: ending the class shows the ended screen", ended);
  await shot(host, "06-host-ended");

  await hostCtx.close();
  await studentCtx.close();

  /* -------------------------------------------------- denied states */
  const deniedCtx = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await login(deniedCtx, "student@personalise.app");
  await deniedCtx.goto(`${BASE}/live/${SESSION_ID}`, { waitUntil: "domcontentloaded" });
  check(
    "revisit after end: shows 'class has ended' rather than the room",
    await deniedCtx.getByText(/already ended/i).isVisible({ timeout: 5000 }).catch(() => false),
  );
  await shot(deniedCtx, "07-denied-finished");
  await deniedCtx.close();
} catch (err) {
  console.error("FATAL:", err);
  results.push({ name: "fatal error", passed: false, detail: String(err) });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exit(1);
