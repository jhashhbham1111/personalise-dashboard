/**
 * Pass codes, top-ups, voiding, and password reset.
 *
 * These are the paths that let the platform work without the instructor
 * personally touching every transaction, so they're the ones worth proving
 * end to end rather than trusting.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/passcode-smoke.mjs
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

// This suite signs several accounts up from one address, which is exactly what
// the signup rate limiter is built to stop. Clearing the counters keeps the
// limiter's real behaviour intact (security-smoke.mjs asserts it) while letting
// this run.
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

/** Signup now ends at an emailed code; the shared helper clears that gate. */
async function signup(page, { name, email, password, phone }) {
  await signUpAndVerify(page, db, { baseUrl: BASE, name, email, password, phone });
}

try {
  /* ------------------------------- the instructor generates a batch of codes */
  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");
  await instructor.goto(`${BASE}/studio/codes`, { waitUntil: "domcontentloaded" });

  await instructor.getByRole("button", { name: /create codes/i }).first().click();
  await instructor.waitForTimeout(500);
  await instructor.fill('input[name="quantity"]', "3");
  await instructor.getByRole("button", { name: /^create codes$/i }).click();
  await instructor.waitForTimeout(2000);

  const { rows: made } = await db.execute(
    "select code, status, amount_paise as amountPaise, sessions_included as sessions from pass_codes order by created_at desc limit 3",
  );
  check("generating codes writes them to the database", made.length === 3, `${made.length} codes`);
  check(
    "codes avoid ambiguous characters",
    made.every((c) => !/[01OIL]/.test(c.code)),
    made.map((c) => c.code).join(", "),
  );
  check(
    "a new code starts unredeemed",
    made.every((c) => c.status === "ACTIVE"),
  );

  /* ------------------------------------ a student redeems one of the codes */
  const studentEmail = testEmail("code");
  const student = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signup(student, {
    name: "Code Student",
    email: studentEmail,
    password: "codepass123",
    phone: "+91 98765 43210",
  });

  const code = made[0].code;
  await student.goto(`${BASE}/dashboard/redeem`, { waitUntil: "domcontentloaded" });
  // The lookup is debounced and only fires once the input is hydrated, so a
  // fixed pause races it on a cold page compile.
  await student.waitForLoadState("networkidle");
  await student.fill("#code-input", code);
  // The preview resolves before the button unlocks, which is the point: the
  // student sees what they're activating before it's spent. Waiting for the
  // button to appear is waiting for exactly that.
  await student
    .getByRole("button", { name: /activate this pass/i })
    .waitFor({ state: "visible", timeout: 20000 });

  const previewText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "the code preview shows what the pass is worth before redeeming",
    previewText.includes("instructor") && previewText.includes("classes"),
  );

  await student.getByRole("button", { name: /activate this pass/i }).click();
  await student.waitForTimeout(2500);

  const { rows: enrolled } = await db.execute({
    sql: `select e.status as status, e.sessions_remaining as remaining
            from enrollments e join users u on u.id = e.student_id
           where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "redeeming a code activates the student's pass with no instructor action",
    enrolled.length === 1 && enrolled[0].status === "ACTIVE",
    `${enrolled.length} enrolment(s), status=${enrolled[0]?.status}`,
  );

  const { rows: ledger } = await db.execute({
    sql: `select p.method as method, p.status as status, p.provider as provider
            from payments p join users u on u.id = p.student_id
           where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "a redemption writes a payment row so the fees ledger stays complete",
    ledger.length === 1 && ledger[0].status === "PAID" && ledger[0].provider === "pass-code",
    `${ledger[0]?.provider}/${ledger[0]?.status}`,
  );

  /* ------------------------------------------ the same code can't be reused */
  const secondEmail = testEmail("code2");
  const second = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signup(second, {
    name: "Second Student",
    email: secondEmail,
    password: "codepass123",
  });
  await second.goto(`${BASE}/dashboard/redeem`, { waitUntil: "domcontentloaded" });
  // The preview is debounced and only runs once the input is hydrated, so a
  // fixed pause races it — wait for the verdict itself to appear.
  await second.waitForLoadState("networkidle");
  await second.fill("#code-input", code);
  await second
    .getByText(/already been used/i)
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});
  const reuseText = (await second.locator("body").innerText()).toLowerCase();
  check(
    "a used code is refused rather than granting a second pass",
    reuseText.includes("already been used"),
  );

  const { rows: noEnrol } = await db.execute({
    sql: `select count(*) as n from enrollments e
            join users u on u.id = e.student_id where u.email = ?`,
    args: [secondEmail],
  });
  check(
    "the second student got nothing from the used code",
    Number(noEnrol[0].n) === 0,
    `${noEnrol[0].n} enrolment(s)`,
  );
  await second.close();

  /* ------------------------------------------- a revoked code stops working */
  await instructor.goto(`${BASE}/studio/codes`, { waitUntil: "domcontentloaded" });
  // domcontentloaded fires before React hydrates, so the first click can land
  // on a button that is painted but not yet listening, and open nothing.
  await instructor.waitForLoadState("networkidle");

  const revokeConfirm = instructor.getByRole("button", { name: /^revoke code$/i });
  await instructor.getByRole("button", { name: /^revoke$/i }).first().click();
  // Wait for the dialog rather than a guessed 500ms — the old fixed pause was
  // sometimes spent before the dialog existed, and the confirm click then had
  // nothing to hit.
  await revokeConfirm.waitFor({ state: "visible", timeout: 15000 });
  await revokeConfirm.click();
  // The dialog closes itself once the action succeeds (useCloseOnSuccess), so
  // its disappearance is the signal that the write is done.
  await revokeConfirm.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});

  const { rows: revoked } = await db.execute(
    "select code from pass_codes where status = 'REVOKED' limit 1",
  );
  check("revoking a code marks it revoked", revoked.length === 1);

  if (revoked.length === 1) {
    const third = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const thirdEmail = testEmail("code3");
    await signup(third, {
      name: "Third Student",
      email: thirdEmail,
      password: "codepass123",
    });
    await third.goto(`${BASE}/dashboard/redeem`, { waitUntil: "domcontentloaded" });
    await third.waitForLoadState("networkidle");
    await third.fill("#code-input", revoked[0].code);
    await third
      .getByText(/no longer valid/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => {});
    const revokedText = (await third.locator("body").innerText()).toLowerCase();
    check(
      "a revoked code can't be redeemed",
      revokedText.includes("no longer valid"),
    );
    await third.close();
  }

  /* ------------------------------- an exhausted pass can be topped up again */
  const { rows: enrolRow } = await db.execute({
    sql: `select e.id as id from enrollments e join users u on u.id = e.student_id
           where u.email = ?`,
    args: [studentEmail],
  });
  await db.execute({
    sql: "update enrollments set sessions_remaining = 0 where id = ?",
    args: [enrolRow[0].id],
  });

  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  await instructor.waitForLoadState("networkidle");
  await instructor.getByRole("button", { name: /record a payment/i }).first().click();
  await instructor.locator("#student-search").waitFor({ state: "visible", timeout: 15000 });
  await instructor.fill("#student-search", studentEmail);
  const option = instructor.locator('ul[role="listbox"] [role="option"]').first();
  await option.waitFor({ timeout: 15000 });
  await option.click();
  await instructor.getByRole("button", { name: /^record payment$/i }).click();
  await instructor.waitForTimeout(2000);

  const { rows: toppedUp } = await db.execute({
    sql: `select sessions_remaining as remaining from enrollments where id = ?`,
    args: [enrolRow[0].id],
  });
  check(
    "a student whose pass ran out can be topped up rather than blocked",
    Number(toppedUp[0].remaining) > 0,
    `${toppedUp[0].remaining} session(s) after top-up`,
  );

  /* -------------------------------- the picker finds a student by phone too */
  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  await instructor.waitForLoadState("networkidle");
  await instructor.getByRole("button", { name: /record a payment/i }).first().click();
  await instructor.locator("#student-search").waitFor({ state: "visible", timeout: 15000 });
  await instructor.fill("#student-search", "9876543210");
  await instructor.waitForTimeout(1500);
  // Scoped to the picker's own listbox: a bare role=option also matches the
  // <option> elements inside the plan <select>, which made this count look
  // like the phone filter was matching everyone.
  const phoneHits = await instructor
    .locator('ul[role="listbox"] [role="option"]')
    .count();
  const phoneNames = await instructor
    .locator('ul[role="listbox"] [role="option"]')
    .allInnerTexts();
  check(
    "a student can be found by phone number",
    phoneHits > 0,
    `${phoneHits} match(es)`,
  );
  check(
    "searching by phone doesn't match students without that number",
    phoneHits > 0 && phoneNames.every((t) => t.includes("Code Student")),
    phoneNames.map((t) => t.split("\n")[0]).join(", ") || "no matches",
  );

  /* ---------------------------------------------- voiding takes the pass back */
  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  const voidButton = instructor.getByRole("button", { name: /^void inv-/i }).first();
  await voidButton.waitFor({ timeout: 10000 });
  await voidButton.click();
  await instructor.waitForTimeout(500);
  await instructor.getByRole("button", { name: /^void payment$/i }).click();
  await instructor.waitForTimeout(2000);

  const { rows: voided } = await db.execute(
    "select count(*) as n from payments where status = 'REFUNDED'",
  );
  check(
    "voiding a payment marks it refunded",
    Number(voided[0].n) >= 1,
    `${voided[0].n} voided`,
  );
  await instructor.close();

  /* --------------------------------------------------- password reset works */
  await student.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });
  await student.fill('input[name="email"]', studentEmail);
  await student.getByRole("button", { name: /send reset link/i }).click();
  await student.waitForTimeout(2000);

  const resetText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "requesting a reset never reveals whether the account exists",
    resetText.includes("if that email has an account"),
  );

  const { rows: tokens } = await db.execute({
    sql: `select t.id as id from password_reset_tokens t
            join users u on u.id = t.user_id where u.email = ?`,
    args: [studentEmail],
  });
  check("a reset token is issued", tokens.length === 1, `${tokens.length} token(s)`);

  // Same request for an address with no account must look identical.
  await student.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });
  await student.fill('input[name="email"]', "definitely-nobody@example.com");
  await student.getByRole("button", { name: /send reset link/i }).click();
  await student.waitForTimeout(1500);
  const unknownText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "an unregistered address gets the identical response",
    unknownText.includes("if that email has an account"),
  );

  const resetRes = await student.goto(`${BASE}/reset-password?token=not-a-real-token`, {
    waitUntil: "domcontentloaded",
  });
  const badTokenText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "an invalid reset link is rejected",
    badTokenText.includes("doesn't work") || badTokenText.includes("expire"),
    `HTTP ${resetRes?.status()}`,
  );

  await student.close();
} catch (err) {
  check("pass code flow completed without throwing", false, String(err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
