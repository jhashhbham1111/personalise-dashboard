/**
 * Pilot-mode smoke test: offline money, no online checkout.
 *
 * Covers the flow the pilot actually depends on — a brand-new student who has
 * never enrolled with anyone gets a pass because their instructor recorded a
 * cash payment — plus proof that the online payment path is genuinely shut,
 * not merely hidden.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/pilot-smoke.mjs
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

try {
  /* ------------------------------------------- a brand-new student signs up */
  const studentEmail = `pilot-${Date.now()}@example.com`;
  const student = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await student.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
  await student.fill('input[name="name"]', "Pilot Student");
  await student.fill('input[name="email"]', studentEmail);
  await student.fill('input[name="password"]', "pilotpass123");
  await student.click('button[type="submit"]');
  await student.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 20000 });
  check("new student can sign up", true, studentEmail);

  const { rows: enrolBefore } = await db.execute({
    sql: `select count(*) as n from enrollments e
            join users u on u.id = e.student_id where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "new student starts with no enrolments",
    Number(enrolBefore[0].n) === 0,
    "this is exactly who the old dropdown could never reach",
  );

  /* --------------------------------- the enrol page offers no online payment */
  const { rows: slugRow } = await db.execute(
    `select ip.slug as slug, o.slug as offering from offerings o
       join instructor_profiles ip on ip.id = o.instructor_id
      where o.is_active = 1 limit 1`,
  );
  const enrolUrl = `${BASE}/i/${slugRow[0].slug}/enrol/${slugRow[0].offering}`;
  await student.goto(enrolUrl, { waitUntil: "domcontentloaded" });
  await student.waitForTimeout(400);

  const payButton = await student
    .getByRole("button", { name: /continue to payment/i })
    .count();
  check("no 'continue to payment' button in offline mode", payButton === 0);

  const bodyText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "the page explains how to pay the instructor instead",
    bodyText.includes("pay") && bodyText.includes("directly"),
  );
  check("prices are still shown", /₹|rs\.?\s?\d/i.test(bodyText));

  /* ------------------------------ the instructor records the cash payment */
  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");
  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  await instructor.getByRole("button", { name: /record a payment/i }).first().click();
  await instructor.waitForTimeout(500);

  await instructor.fill('input[name="studentEmail"]', studentEmail);
  await instructor.getByRole("button", { name: /^record payment$/i }).click();
  await instructor.waitForTimeout(2000);

  const { rows: enrolAfter } = await db.execute({
    sql: `select e.status as status, e.sessions_remaining as remaining
            from enrollments e join users u on u.id = e.student_id
           where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "recording a cash payment enrols a never-before-seen student",
    enrolAfter.length === 1 && enrolAfter[0].status === "ACTIVE",
    `${enrolAfter.length} enrolment(s), status=${enrolAfter[0]?.status}`,
  );

  const { rows: payRow } = await db.execute({
    sql: `select p.method as method, p.status as status, p.invoice_no as invoiceNo
            from payments p join users u on u.id = p.student_id
           where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "an OFFLINE payment row with an invoice number is written",
    payRow[0]?.method === "OFFLINE" &&
      payRow[0]?.status === "PAID" &&
      !!payRow[0]?.invoiceNo,
    `${payRow[0]?.method}/${payRow[0]?.status}/${payRow[0]?.invoiceNo}`,
  );

  /* ------------------------------------- recording it twice is refused */
  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  await instructor.getByRole("button", { name: /record a payment/i }).first().click();
  await instructor.waitForTimeout(400);
  await instructor.fill('input[name="studentEmail"]', studentEmail);
  await instructor.getByRole("button", { name: /^record payment$/i }).click();
  await instructor.waitForTimeout(1500);

  const { rows: enrolDup } = await db.execute({
    sql: `select count(*) as n from enrollments e
            join users u on u.id = e.student_id where u.email = ?`,
    args: [studentEmail],
  });
  check(
    "recording the same payment twice doesn't double the pass",
    Number(enrolDup[0].n) === 1,
    `${enrolDup[0].n} enrolment(s)`,
  );

  /* ------------------------------ an unknown email is a clear error */
  await instructor.goto(`${BASE}/studio/payments`, { waitUntil: "domcontentloaded" });
  await instructor.getByRole("button", { name: /record a payment/i }).first().click();
  await instructor.waitForTimeout(400);
  await instructor.fill('input[name="studentEmail"]', "nobody-here@example.com");
  await instructor.getByRole("button", { name: /^record payment$/i }).click();
  await instructor.waitForTimeout(1200);
  const dialogText = (await instructor.locator("body").innerText()).toLowerCase();
  check(
    "an unknown email explains what to do rather than failing silently",
    dialogText.includes("no student account") || dialogText.includes("sign up"),
  );
  await instructor.close();

  /* ----------------------------------- the student can now book a class */
  await student.goto(`${BASE}/dashboard/passes`, { waitUntil: "domcontentloaded" });
  await student.waitForTimeout(500);
  const passText = (await student.locator("body").innerText()).toLowerCase();
  check(
    "the pass shows on the student's dashboard",
    !passText.includes("no passes") && !passText.includes("nothing here"),
  );

  /* ------------------------------------- the checkout route is really gone */
  const { rows: anyPayment } = await db.execute(
    "select id from payments order by created_at desc limit 1",
  );
  const checkoutRes = await student.goto(`${BASE}/checkout/${anyPayment[0].id}`, {
    waitUntil: "domcontentloaded",
  });
  check(
    "the checkout route 404s while payments are offline",
    checkoutRes?.status() === 404,
    `HTTP ${checkoutRes?.status()}`,
  );

  await student.close();

  /* ---------------------------------- cron endpoints refuse unauthenticated */
  const cronRes = await fetch(`${BASE}/api/cron/send-reminders`);
  check(
    "cron endpoint refuses a request with no secret",
    cronRes.status === 401 || cronRes.status === 503,
    `HTTP ${cronRes.status}`,
  );

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check("health check reports the database reachable", health.ok === true);
} catch (err) {
  check("pilot flow completed without throwing", false, String(err));
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
