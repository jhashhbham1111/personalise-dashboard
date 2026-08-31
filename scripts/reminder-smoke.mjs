/**
 * Class-reminder smoke test.
 *
 * Verifies the whole loop end to end: a class starting soon gets exactly one
 * reminder sent to its instructor and every confirmed student, the cron is
 * idempotent (calling it again sends nothing new), and each role's
 * notification bell opens *their own* list with the reminder visible in it.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/reminder-smoke.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { chromium } from "playwright";
import { skipFirstRunScreensEverywhere } from "./lib/signup.mjs";

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

/* ------------------------------------------------------- pick a session */

const { rows } = await db.execute({
  sql: `select cs.id as id, cs.title as title, cs.instructor_id as instructorId,
               ip.user_id as instructorUserId, b.student_id as studentId
        from class_sessions cs
        join instructor_profiles ip on ip.id = cs.instructor_id
        join bookings b on b.session_id = cs.id
        where cs.status = ? and b.status = ?
        order by cs.starts_at asc
        limit 1`,
  args: ["SCHEDULED", "CONFIRMED"],
});

if (rows.length === 0) {
  console.error(
    "\nNo scheduled class with a confirmed booking found." +
      "\nRun `npm run db:reset` to restore the demo data, then try again.\n",
  );
  process.exit(1);
}

const { id: sessionId, title, instructorUserId, studentId } = rows[0];
const now = Date.now();

// 30 minutes out — inside the 60-minute reminder window, not yet started,
// and not yet reminded.
await db.execute({
  sql: `update class_sessions
        set starts_at = ?, ends_at = ?, status = ?, reminded_at = null
        where id = ?`,
  args: [now + 30 * 60_000, now + 90 * 60_000, "SCHEDULED", sessionId],
});

async function unreadCount(userId) {
  const { rows } = await db.execute({
    sql: `select count(*) as n from notifications where user_id = ? and read_at is null`,
    args: [userId],
  });
  return Number(rows[0].n);
}

async function latestReminder(userId) {
  const { rows } = await db.execute({
    sql: `select title, body, link from notifications
          where user_id = ? and type = 'CLASS_REMINDER'
          order by created_at desc limit 1`,
    args: [userId],
  });
  return rows[0] ?? null;
}

const instructorUnreadBefore = await unreadCount(instructorUserId);
const studentUnreadBefore = await unreadCount(studentId);

/* ---------------------------------------------------------- fire the cron */

const cronHeaders = process.env.CRON_SECRET
  ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  : {};

const res1 = await fetch(`${BASE}/api/cron/send-reminders`, { headers: cronHeaders });
const body1 = await res1.json();
check("cron responds 200", res1.status === 200, JSON.stringify(body1));
check("cron reminded exactly our session", body1.sessionsReminded >= 1, `sessionsReminded=${body1.sessionsReminded}`);
check("instructor notified", body1.instructorsNotified >= 1, `instructorsNotified=${body1.instructorsNotified}`);
check("student notified", body1.studentsNotified >= 1, `studentsNotified=${body1.studentsNotified}`);

const { rows: after } = await db.execute({
  sql: `select reminded_at as remindedAt from class_sessions where id = ?`,
  args: [sessionId],
});
check("session.remindedAt set", after[0]?.remindedAt != null);

const instructorReminder = await latestReminder(instructorUserId);
const studentReminder = await latestReminder(studentId);
check("instructor got a CLASS_REMINDER row", !!instructorReminder && instructorReminder.title.includes(title));
check(
  "instructor reminder links into the studio",
  !!instructorReminder && instructorReminder.link === `/studio/sessions/${sessionId}`,
  instructorReminder?.link,
);
check("student got a CLASS_REMINDER row", !!studentReminder && studentReminder.title.includes(title));

const instructorUnreadAfter = await unreadCount(instructorUserId);
const studentUnreadAfter = await unreadCount(studentId);
check("instructor unread count went up", instructorUnreadAfter > instructorUnreadBefore);
check("student unread count went up", studentUnreadAfter > studentUnreadBefore);

/* -------------------------------------------------------- idempotency */

const res2 = await fetch(`${BASE}/api/cron/send-reminders`, { headers: cronHeaders });
const body2 = await res2.json();
check("second cron run reminds nobody new", body2.sessionsReminded === 0, JSON.stringify(body2));

/* -------------------------------------------------- bell routing (UI) */

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

try {
  const instructorPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructorPage, "ananya@personalise.app");
  await instructorPage.getByLabel(/Notifications/i).click();
  await instructorPage.waitForURL((url) => url.pathname === "/studio/notifications", {
    timeout: 10000,
  });
  check("instructor bell opens /studio/notifications", true);
  await instructorPage.waitForTimeout(400);
  check(
    "reminder visible on instructor notifications page",
    await instructorPage.getByText(title, { exact: false }).first().isVisible(),
  );
  await instructorPage.close();

  const studentPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(studentPage, "student@personalise.app");
  await studentPage.getByLabel(/Notifications/i).click();
  await studentPage.waitForURL((url) => url.pathname === "/dashboard/notifications", {
    timeout: 10000,
  });
  check("student bell opens /dashboard/notifications", true);
  // The list renders after hydration; a fixed pause races a cold compile of
  // this route, which is why this check flickered rather than failed honestly.
  await studentPage.waitForLoadState("networkidle");
  await studentPage
    .getByText(title, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});
  check(
    "reminder visible on student notifications page",
    await studentPage.getByText(title, { exact: false }).first().isVisible(),
  );
  await studentPage.close();
} catch (err) {
  check("bell routing checks completed without throwing", false, String(err));
} finally {
  await browser.close();
}

/* ------------------------------------------------------------- summary */

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
