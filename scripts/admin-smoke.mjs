/**
 * Admin moderation + payouts smoke test.
 *
 * The interesting assertions aren't "the button renders" — they're that
 * suspending an instructor actually removes them from the public site and
 * stops new bookings, and that reinstating puts everything back.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/admin-smoke.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { skipFirstRunScreensEverywhere } from "./lib/signup.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = "screenshots/admin";
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
// The launch screen and first-run intro are full-screen overlays for a
// first-time visitor; without this they silently swallow the suite's clicks.
skipFirstRunScreensEverywhere(browser);

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Is the instructor visible to a signed-out visitor? */
async function publicVisibility(page) {
  await page.goto(`${BASE}/instructors`, { waitUntil: "domcontentloaded" });
  const inDirectory = (await page.locator('a[href="/i/ananya-iyer"]').count()) > 0;

  // The 404 renders after hydration, so ask the response itself rather than
  // racing the DOM.
  const res = await page.goto(`${BASE}/i/ananya-iyer`, { waitUntil: "domcontentloaded" });
  const profileOk = res?.status() === 200;

  await page.goto(`${BASE}/classes`, { waitUntil: "domcontentloaded" });
  const classCount = await page.locator('a[href^="/classes/"]').count();

  return { inDirectory, profileOk, classCount };
}

try {
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const anon = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* --------------------------------------------------- baseline: visible */
  const before = await publicVisibility(anon);
  check("before suspension: instructor is in the public directory", before.inDirectory);
  check("before suspension: public profile loads", before.profileOk);
  check("before suspension: classes are listed publicly", before.classCount > 0,
    `${before.classCount} classes`);

  /* ----------------------------------------------------------- admin UI */
  await login(admin, "admin@personalise.app");
  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check("admin overview loads", await admin.getByText(/platform admin/i).first().isVisible());
  /*
   * Asserts the log renders entries, not one specific seeded note. The panel
   * shows only the 12 most recent events, so anchoring on the seed's
   * "Yoga Alliance register" note made this pass or fail on how many times the
   * smoke suites had been run — every suspend/reinstate cycle pushed it
   * further down until it fell off.
   */
  const loggedActions = await admin
    .locator("text=/^(Verified|Suspended|Reinstated|Unverified)$/")
    .count();
  check(
    "moderation log lists recorded actions",
    loggedActions > 0,
    `${loggedActions} entries shown`,
  );
  await shot(admin, "01-admin-overview");

  await admin.goto(`${BASE}/admin/instructors`, { waitUntil: "domcontentloaded" });
  check("instructor list loads", await admin.getByText("Ananya Iyer").first().isVisible());
  await shot(admin, "02-admin-instructors");

  /* ------------------------------------------------------- payout report */
  await admin.goto(`${BASE}/admin/payouts`, { waitUntil: "domcontentloaded" });
  const payoutHasMoney = await admin.locator("text=/₹/").first().isVisible().catch(() => false);
  check("payout report renders with figures", payoutHasMoney);
  check(
    "payout report separates the platform fee",
    await admin.getByText(/platform fee/i).first().isVisible().catch(() => false),
  );
  await shot(admin, "03-admin-payouts");

  /* ------------------------------------------------------------ suspend */
  await admin.goto(`${BASE}/admin/instructors`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: /^Suspend$/ }).first().click();
  await admin.waitForTimeout(700);

  // The reason is mandatory: submitting empty must not suspend anyone.
  const reasonBox = admin.locator('textarea[name="reason"]');
  check("suspend dialog asks for a reason", await reasonBox.isVisible());
  check("reason field is required", await reasonBox.getAttribute("required") !== null);
  await shot(admin, "04-suspend-dialog");

  await reasonBox.fill("Smoke test suspension — repeated no-shows reported.");
  await admin.getByRole("button", { name: /suspend account/i }).click();
  await admin.waitForTimeout(2500);
  check(
    "suspension confirms with what it did",
    await admin.getByText(/page is hidden and no new bookings/i).first().isVisible().catch(() => false),
  );
  await shot(admin, "05-suspended");

  /* -------------------------------- the part that actually matters */
  const during = await publicVisibility(anon);
  check("suspended: gone from the public directory", !during.inDirectory);
  check("suspended: public profile 404s", !during.profileOk);
  check("suspended: classes no longer listed publicly", during.classCount === 0,
    `${during.classCount} still listed`);

  const student = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(student, "student@personalise.app");
  const studentRes = await student.goto(`${BASE}/i/ananya-iyer`, {
    waitUntil: "domcontentloaded",
  });
  check(
    "suspended: an enrolled student can't reach the instructor page either",
    studentRes?.status() === 404,
  );
  await student.waitForLoadState("load").catch(() => {});
  check(
    "the 404 offers a way back rather than a blank page",
    await student
      .getByRole("link", { name: /browse classes/i })
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false),
  );
  check(
    "the 404 doesn't draw the site header twice",
    (await student.getByRole("link", { name: /^Instructors$/ }).count()) <= 1,
  );
  await shot(student, "08-not-found");

  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");
  await instructor.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  check(
    "suspended: the instructor is told, with the reason",
    await instructor.getByText(/repeated no-shows reported/i).first().isVisible().catch(() => false),
  );
  await shot(instructor, "06-instructor-notified");

  await instructor.goto(`${BASE}/studio/profile`, { waitUntil: "domcontentloaded" });
  check(
    "suspended: the publish button is replaced, not just disabled",
    (await instructor.getByRole("button", { name: /publish my page/i }).count()) === 0,
  );

  /* ---------------------------------------------------------- reinstate */
  await admin.goto(`${BASE}/admin/instructors`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: /reinstate/i }).first().click();
  await admin.waitForTimeout(2500);

  const after = await publicVisibility(anon);
  check("reinstated: back in the public directory", after.inDirectory);
  check("reinstated: public profile loads again", after.profileOk);
  check("reinstated: classes listed again", after.classCount > 0, `${after.classCount} classes`);

  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  check(
    "moderation log records both the suspension and the reinstatement",
    (await admin.getByText(/Suspended/).count()) > 0 &&
      (await admin.getByText(/Reinstated/).count()) > 0,
  );
  await shot(admin, "07-moderation-log");

  await Promise.all([admin.close(), anon.close(), student.close(), instructor.close()]);
} catch (err) {
  console.error("FATAL:", err);
  results.push({ name: "suite completed without an exception", passed: false, detail: String(err) });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exit(1);
