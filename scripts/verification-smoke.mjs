/**
 * Verification as a real gate, not a badge.
 *
 * Until now `isVerified` only drew a tick on a card: an unverified stranger
 * could publish a page and take bookings exactly like a checked instructor.
 * These checks prove the gate actually closes, that it doesn't lock the
 * instructor out of their own page, and that verifying opens it again.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/verification-smoke.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

await db.execute("delete from rate_limit_hits");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function login(page, email, password = "password123") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function setVerified(instructorId, verified) {
  await db.execute({
    sql: "update instructor_profiles set is_verified = ? where id = ?",
    args: [verified ? 1 : 0, instructorId],
  });
}

// Restored in `finally` so this suite can't leave the fixture unverified and
// break every other suite that expects a visible instructor.
let fixtureId = null;

try {
  const { rows: fx } = await db.execute(
    `select ip.id as id, ip.slug as slug, ip.is_verified as wasVerified,
            o.slug as offeringSlug
       from instructor_profiles ip
       join offerings o on o.instructor_id = ip.id
      where ip.is_published = 1 and ip.is_suspended = 0 and o.is_active = 1
      limit 1`,
  );
  const f = fx[0];
  fixtureId = f?.id;
  check("found a published instructor to test with", !!f, f?.slug);

  const profileUrl = `${BASE}/i/${f.slug}`;
  const enrolUrl = `${BASE}/i/${f.slug}/enrol/${f.offeringSlug}`;

  /* ------------------------------------- verified: visible as before */
  await setVerified(f.id, true);
  const anon = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await anon.goto(`${BASE}/instructors`, { waitUntil: "domcontentloaded" });
  check(
    "a verified instructor is listed in the directory",
    (await anon.locator(`a[href="/i/${f.slug}"]`).count()) > 0,
  );

  const okProfile = await anon.goto(profileUrl, { waitUntil: "domcontentloaded" });
  check("their profile page loads", okProfile?.status() === 200);

  const okEnrol = await anon.goto(enrolUrl, { waitUntil: "domcontentloaded" });
  check("their enrol page loads", okEnrol?.status() === 200);

  await anon.goto(`${BASE}/classes?within=all`, { waitUntil: "domcontentloaded" });
  const listedBefore = await anon.locator('a[href^="/classes/"]').count();
  check("their classes are listed", listedBefore > 0, `${listedBefore} classes`);

  /* --------------------------------- unverified: gone from every surface */
  await setVerified(f.id, false);

  await anon.goto(`${BASE}/instructors`, { waitUntil: "domcontentloaded" });
  check(
    "an unverified instructor is not in the directory",
    (await anon.locator(`a[href="/i/${f.slug}"]`).count()) === 0,
  );

  const hiddenProfile = await anon.goto(profileUrl, { waitUntil: "domcontentloaded" });
  check(
    "their profile 404s for the public",
    hiddenProfile?.status() === 404,
    `HTTP ${hiddenProfile?.status()}`,
  );

  const hiddenEnrol = await anon.goto(enrolUrl, { waitUntil: "domcontentloaded" });
  check(
    "their enrol page 404s too — no taking money through a direct link",
    hiddenEnrol?.status() === 404,
    `HTTP ${hiddenEnrol?.status()}`,
  );

  await anon.goto(`${BASE}/classes?within=all`, { waitUntil: "domcontentloaded" });
  const listedAfter = await anon.locator('a[href^="/classes/"]').count();
  check(
    "their classes disappear from the class directory",
    listedAfter === 0,
    `${listedAfter} classes still listed`,
  );

  await anon.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check(
    "…and from the homepage",
    (await anon.locator(`a[href="/i/${f.slug}"]`).count()) === 0,
  );
  await anon.close();

  /* ------------------------- the instructor can still preview their own page */
  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");

  const ownProfile = await instructor.goto(profileUrl, { waitUntil: "domcontentloaded" });
  check(
    "the instructor can still open their own hidden page",
    ownProfile?.status() === 200,
    `HTTP ${ownProfile?.status()}`,
  );

  const previewText = await instructor.locator("body").innerText();
  check(
    "…and is told it's only a preview",
    /preview/i.test(previewText) && /verif/i.test(previewText),
  );

  await instructor.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  const studioText = await instructor.locator("body").innerText();
  check(
    "the studio overview explains they're waiting on verification",
    /verified before students can find you/i.test(studioText),
  );

  await instructor.goto(`${BASE}/studio/profile`, { waitUntil: "domcontentloaded" });
  const toggleText = await instructor.locator("body").innerText();
  check(
    "the publish card no longer claims the page is live",
    /waiting to be verified/i.test(toggleText) &&
      !/your page is live/i.test(toggleText),
  );
  await instructor.close();

  /* ------------------------------------------ an admin can verify them */
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(admin, "admin@personalise.app");

  const adminProfileView = await admin.goto(profileUrl, {
    waitUntil: "domcontentloaded",
  });
  check(
    "an admin can read the page they're being asked to approve",
    adminProfileView?.status() === 200,
    `HTTP ${adminProfileView?.status()}`,
  );

  await admin.goto(`${BASE}/admin/instructors`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: /^Verify$/ }).first().click();
  await admin.waitForTimeout(1500);

  const { rows: afterVerify } = await db.execute({
    sql: "select is_verified as v from instructor_profiles where id = ?",
    args: [f.id],
  });
  check(
    "the Verify button actually verifies",
    Number(afterVerify[0].v) === 1,
    `is_verified=${afterVerify[0].v}`,
  );
  await admin.close();

  /* ------------------------------------------- and visibility returns */
  const anon2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await anon2.goto(`${BASE}/instructors`, { waitUntil: "domcontentloaded" });
  check(
    "verifying puts them back in the directory",
    (await anon2.locator(`a[href="/i/${f.slug}"]`).count()) > 0,
  );
  const backProfile = await anon2.goto(profileUrl, { waitUntil: "domcontentloaded" });
  check("…and their page loads again", backProfile?.status() === 200);
  await anon2.close();
} catch (err) {
  check("verification suite completed without throwing", false, String(err));
} finally {
  await browser.close();
  if (fixtureId) {
    await db
      .execute({
        sql: "update instructor_profiles set is_verified = 1 where id = ?",
        args: [fixtureId],
      })
      .catch(() => undefined);
  }
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
