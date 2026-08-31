/**
 * The money path: paying an instructor, getting a code, and the state of a
 * pass actually matching the button you're shown.
 *
 * Each check corresponds to a specific reported gap, so a failure here names
 * the thing that broke rather than "a page changed".
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/money-path-smoke.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { signUpAndVerify, testEmail,
  skipFirstRunScreensEverywhere,
} from "./lib/signup.mjs";
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
// The launch screen and first-run intro are full-screen overlays for a
// first-time visitor; without this they silently swallow the suite's clicks.
skipFirstRunScreensEverywhere(browser);

async function login(page, email, password = "password123") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

/** Grants a pass directly, so pass-state tests don't depend on the UI. */
async function grantEnrollment({ studentId, offeringId, instructorId, planId, sessionsRemaining, expiresAt }) {
  const id = `enr_test_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `insert into enrollments
            (id, student_id, offering_id, instructor_id, plan_id, status,
             sessions_remaining, started_at, expires_at, created_at, updated_at)
          values (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    args: [id, studentId, offeringId, instructorId, planId, sessionsRemaining,
           Date.now(), expiresAt, Date.now(), Date.now()],
  });
  return id;
}

try {
  const { rows: fixture } = await db.execute(
    `select o.id as offeringId, o.slug as offeringSlug, o.instructor_id as instructorId,
            ip.slug as instructorSlug, ip.user_id as instructorUserId,
            pp.id as planId
       from offerings o
       join instructor_profiles ip on ip.id = o.instructor_id
       join pricing_plans pp on pp.offering_id = o.id
      where o.is_active = 1 and pp.is_active = 1 limit 1`,
  );
  const fx = fixture[0];
  check("found a class with a price to test against", !!fx, fx?.offeringSlug);

  const enrolUrl = `${BASE}/i/${fx.instructorSlug}/enrol/${fx.offeringSlug}`;

  /* ------------------------------------ 1. payment details reach the student */
  await db.execute({
    sql: `update instructor_profiles
             set upi_id = ?, bank_details = ?, payment_note = ?
           where id = ?`,
    args: ["testteacher@okhdfcbank", "Test Teacher\nHDFC · 50100123456789\nIFSC HDFC0000123",
           "WhatsApp me the screenshot and I'll send your code.", fx.instructorId],
  });

  const anon = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await anon.goto(enrolUrl, { waitUntil: "domcontentloaded" });
  const enrolText = await anon.locator("body").innerText();

  check(
    "the enrol page shows the instructor's UPI ID",
    enrolText.includes("testteacher@okhdfcbank"),
  );
  check(
    "…and the bank details",
    enrolText.includes("HDFC0000123"),
  );
  check(
    "…and the instructor's own note",
    enrolText.includes("WhatsApp me the screenshot"),
  );

  const qr = anon.locator('img[alt*="UPI QR"]');
  const qrSrc = await qr.getAttribute("src").catch(() => null);
  check(
    "a scannable UPI QR is rendered inline",
    !!qrSrc && qrSrc.startsWith("data:image/"),
    qrSrc ? `${qrSrc.slice(0, 24)}… (${qrSrc.length} bytes)` : "no QR found",
  );

  /* ---------------- 2. with nothing filled in, no empty panel is shown */
  await db.execute({
    sql: `update instructor_profiles set upi_id = null, bank_details = null,
             payment_note = null where id = ?`,
    args: [fx.instructorId],
  });
  await anon.goto(enrolUrl, { waitUntil: "domcontentloaded" });
  const bareText = await anon.locator("body").innerText();
  check(
    "with no payment details saved, the page falls back to the old wording",
    bareText.includes("directly") && !bareText.includes("Paying "),
  );
  await anon.close();

  // Put them back for the remaining checks.
  await db.execute({
    sql: `update instructor_profiles set upi_id = ? where id = ?`,
    args: ["testteacher@okhdfcbank", fx.instructorId],
  });

  /* -------------------------------- 3. a bad UPI ID is refused server-side */
  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");
  await instructor.goto(`${BASE}/studio/profile`, { waitUntil: "domcontentloaded" });
  await instructor.fill("#upiId", "not-a-upi-id");
  await instructor.getByRole("button", { name: /save profile/i }).click();
  await instructor.waitForTimeout(1500);

  const { rows: afterBad } = await db.execute({
    sql: "select upi_id as upiId from instructor_profiles where id = ?",
    args: [fx.instructorId],
  });
  check(
    "a malformed UPI ID is rejected rather than saved",
    afterBad[0]?.upiId !== "not-a-upi-id",
    `stored: ${afterBad[0]?.upiId}`,
  );

  /* ------------------------------- 4. generated codes come back to the UI */
  await instructor.goto(`${BASE}/studio/codes`, { waitUntil: "domcontentloaded" });
  await instructor.getByRole("button", { name: /create codes/i }).first().click();
  await instructor.waitForTimeout(500);
  await instructor.fill("#quantity", "3");
  await instructor.getByRole("button", { name: /^create codes$/i }).click();
  await instructor.waitForTimeout(2500);

  const dialogText = await instructor.locator("body").innerText();
  check(
    "the codes themselves are shown after creating them",
    /[A-Z0-9]{4}-[A-Z0-9]{4}/.test(dialogText),
    dialogText.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0] ?? "no code visible",
  );
  check(
    "a bulk copy action is offered",
    await instructor
      .getByRole("button", { name: /copy all/i })
      .isVisible()
      .catch(() => false),
  );
  check(
    "a print sheet is offered",
    await instructor
      .getByRole("link", { name: /print sheet/i })
      .isVisible()
      .catch(() => false),
  );

  /* ------------------------------------------- 5. the print sheet renders */
  await instructor.goto(`${BASE}/studio/codes/print`, { waitUntil: "domcontentloaded" });
  const printText = await instructor.locator("body").innerText();
  const printedCodes = printText.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g) ?? [];
  const { rows: activeCount } = await db.execute({
    sql: "select count(*) as n from pass_codes where instructor_id = ? and status = 'ACTIVE'",
    args: [fx.instructorId],
  });
  check(
    "the print sheet lists every unused code",
    printedCodes.length === Number(activeCount[0].n),
    `${printedCodes.length} printed vs ${activeCount[0].n} unused`,
  );
  check(
    "each printed code says where to redeem it",
    printText.includes("/dashboard/redeem"),
  );
  await instructor.close();

  /* ------------------------ 6. studio nav is shorter, nothing unreachable */
  const studio = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(studio, "ananya@personalise.app");
  await studio.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  const primaryTabs = await studio
    .locator('nav[aria-label="Studio sections"] > a')
    .count();
  check(
    "the studio tab row is down to the weekly six",
    primaryTabs === 6,
    `${primaryTabs} primary tabs`,
  );
  // The set-up-once sections moved out of a "More" tab and into the account
  // menu behind the avatar, so the tab row is only the weekly six.
  // Notifications is deliberately no longer listed anywhere in this menu — the
  // header bell is the single way in.
  await studio.getByRole("button", { name: /account menu/i }).click();
  await studio.waitForTimeout(400);
  const moreText = await studio.locator("body").innerText();
  check(
    "the moved sections are all still reachable from the account menu",
    ["My profile", "Venues", "Videos", "Updates", "Analytics"].every((l) =>
      moreText.includes(l),
    ),
  );
  check(
    "the header bell is still the way to notifications",
    await studio.getByLabel(/notifications/i).first().isVisible(),
  );
  await studio.close();

  /* ----------------- 7. a spent pass doesn't get offered a Book button */
  const studentEmail = testEmail("money");
  const student = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signUpAndVerify(student, db, {
    baseUrl: BASE,
    name: "Money Tester",
    email: studentEmail,
    password: "moneypass123",
  });

  const { rows: studentRow } = await db.execute({
    sql: "select id from users where email = ?",
    args: [studentEmail],
  });
  const studentId = studentRow[0].id;

  const { rows: sessionRow } = await db.execute({
    sql: `select id from class_sessions
           where offering_id = ? and status = 'SCHEDULED' and starts_at > ?
           order by starts_at limit 1`,
    args: [fx.offeringId, Date.now()],
  });
  const sessionId = sessionRow[0]?.id;
  check("found an upcoming session of that class", !!sessionId);

  // Spent: ACTIVE, but zero credits left.
  const spentId = await grantEnrollment({
    studentId,
    offeringId: fx.offeringId,
    instructorId: fx.instructorId,
    planId: fx.planId,
    sessionsRemaining: 0,
    expiresAt: null,
  });

  await student.goto(`${BASE}/classes/${sessionId}`, { waitUntil: "domcontentloaded" });
  const spentText = await student.locator("body").innerText();
  check(
    "a spent pass gets no Book button",
    !(await student
      .getByRole("button", { name: /book my place/i })
      .isVisible()
      .catch(() => false)),
  );
  check(
    "…and is told it ran out, not that they never had one",
    /used every class/i.test(spentText),
  );
  check(
    "…and is offered a top-up",
    await student
      .getByRole("link", { name: /top up your pass/i })
      .isVisible()
      .catch(() => false),
  );

  // Expired: ACTIVE with credits, but past its expiry.
  await db.execute({ sql: "delete from enrollments where id = ?", args: [spentId] });
  const expiredId = await grantEnrollment({
    studentId,
    offeringId: fx.offeringId,
    instructorId: fx.instructorId,
    planId: fx.planId,
    sessionsRemaining: 5,
    expiresAt: Date.now() - 86400000,
  });

  await student.goto(`${BASE}/classes/${sessionId}`, { waitUntil: "domcontentloaded" });
  const expiredText = await student.locator("body").innerText();
  check(
    "an expired pass gets no Book button either",
    !(await student
      .getByRole("button", { name: /book my place/i })
      .isVisible()
      .catch(() => false)),
  );
  check("…and is told it expired", /expired/i.test(expiredText));

  // The listing card must agree with the class page.
  await student.goto(`${BASE}/classes?within=all`, { waitUntil: "domcontentloaded" });
  const cardBook = await student.getByRole("link", { name: /^book$/i }).count();
  check(
    "listing cards don't offer Book for an unusable pass either",
    cardBook === 0,
    `${cardBook} bare "Book" links`,
  );

  // A healthy pass must still work — otherwise this is just a broken gate.
  await db.execute({ sql: "delete from enrollments where id = ?", args: [expiredId] });
  const goodId = await grantEnrollment({
    studentId,
    offeringId: fx.offeringId,
    instructorId: fx.instructorId,
    planId: fx.planId,
    sessionsRemaining: 5,
    expiresAt: null,
  });
  await student.goto(`${BASE}/classes/${sessionId}`, { waitUntil: "domcontentloaded" });
  check(
    "a healthy pass still gets the Book button",
    await student
      .getByRole("button", { name: /book my place/i })
      .isVisible()
      .catch(() => false),
  );
  await db.execute({ sql: "delete from enrollments where id = ?", args: [goodId] });

  /* --------------------------- 8. pass codes are findable for a student */
  await student.goto(`${BASE}/dashboard/passes`, { waitUntil: "domcontentloaded" });
  const passesText = await student.locator("body").innerText();
  check(
    "the empty passes page mentions pass codes",
    /pass code/i.test(passesText),
  );
  check(
    "…and links straight to redeeming one",
    await student
      .getByRole("link", { name: /redeem a code/i })
      .first()
      .isVisible()
      .catch(() => false),
  );
  await student.close();

  /* ------------------------------------------ 9. single-day date filter */
  const browse = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const { rows: dayRow } = await db.execute({
    sql: `select starts_at as startsAt from class_sessions
           where status = 'SCHEDULED' and starts_at > ? order by starts_at limit 1`,
    args: [Date.now()],
  });
  const day = new Date(Number(dayRow[0].startsAt));
  const dayParam = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

  await browse.goto(`${BASE}/classes?within=day&from=${dayParam}`, {
    waitUntil: "domcontentloaded",
  });
  const dayText = await browse.locator("body").innerText();
  check(
    "the results line names the chosen day rather than a range",
    // Singular when there's exactly one — "1 class on Tuesday…".
    /\bclass(es)? on /i.test(dayText),
    dayText.split("\n").find((l) => /\bclass(es)? on /i.test(l)) ?? "",
  );

  // Every heading on a single-day view must be that one day.
  const headings = await browse.locator("main section > h2").allInnerTexts();
  check(
    "a single-day view shows exactly one day of classes",
    headings.length <= 1,
    `${headings.length} day heading(s): ${headings.join(" | ")}`,
  );

  check(
    "the date box has a visible label",
    await browse
      .locator('label[for="filter-from"]')
      .isVisible()
      .catch(() => false),
  );
  await browse.close();
} catch (err) {
  check("money path suite completed without throwing", false, String(err));
} finally {
  await browser.close();
  // This suite writes payment details onto a seeded instructor. Leaving them
  // there changes what other suites see on the enrol page, so put the fixture
  // back the way it was found.
  await db
    .execute(
      `update instructor_profiles
          set upi_id = null, bank_details = null, payment_note = null
        where upi_id = 'testteacher@okhdfcbank' or bank_details like 'Test Teacher%'`,
    )
    .catch(() => undefined);
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
