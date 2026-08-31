/**
 * Concurrency smoke test.
 *
 * The capacity, credit and waitlist logic all used to be check-then-write, with
 * several network round trips in the gap. That reads fine and passes every
 * sequential test, and still oversells a class the moment two people press Book
 * at the same instant. This drives the real HTTP endpoints in parallel and
 * asserts on what actually landed in the database.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/concurrency-smoke.mjs
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

const PASSWORD = "password123";
const RACERS = 5;

/* ------------------------------------------------- pick a target session */

const { rows: sessionRows } = await db.execute({
  sql: `select cs.id as id, cs.title as title, cs.offering_id as offeringId,
               cs.instructor_id as instructorId
          from class_sessions cs
         where cs.status = 'SCHEDULED' and cs.starts_at > ?
         order by cs.starts_at asc
         limit 1`,
  args: [Date.now() + 6 * 3600_000],
});
if (sessionRows.length === 0) {
  console.error("\nNo future scheduled session found. Run `npm run db:reset`.\n");
  process.exit(1);
}
const target = sessionRows[0];

// One seat, so any second CONFIRMED booking is by definition an oversell.
await db.execute({
  sql: "update class_sessions set capacity = 1 where id = ?",
  args: [target.id],
});
await db.execute({ sql: "delete from bookings where session_id = ?", args: [target.id] });

const { rows: planRows } = await db.execute({
  sql: `select id, sessions_included as sessionsIncluded from pricing_plans
         where offering_id = ? and is_active = 1
         order by sessions_included desc limit 1`,
  args: [target.offeringId],
});
if (planRows.length === 0) {
  console.error("\nNo active plan on that offering. Run `npm run db:reset`.\n");
  process.exit(1);
}
const planId = planRows[0].id;

/* ------------------------------------------- create racers with real passes */

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
// The launch screen and first-run intro are full-screen overlays for a
// first-time visitor; without this they silently swallow the suite's clicks.
skipFirstRunScreensEverywhere(browser);

async function makeStudent(i) {
  const email = testEmail(`race-${i}`);
  const page = await browser.newPage();
  await signUpAndVerify(page, db, {
    baseUrl: BASE,
    name: `Racer ${i}`,
    email,
    password: PASSWORD,
  });

  const { rows } = await db.execute({
    sql: "select id from users where email = ?",
    args: [email],
  });
  const userId = rows[0].id;

  // Give them a pass directly — this test is about the booking race, not checkout.
  await db.execute({
    sql: `insert into enrollments
            (id, student_id, offering_id, instructor_id, plan_id, status,
             sessions_remaining, started_at, created_at)
          values (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      userId,
      target.offeringId,
      target.instructorId,
      planId,
      10,
      Date.now(),
      Date.now(),
    ],
  });

  const cookies = await page.context().cookies();
  await page.close();
  return { email, userId, cookies };
}

const students = [];
for (let i = 0; i < RACERS; i++) students.push(await makeStudent(i));

/* --------------------------------------------------- race them at one seat */

async function bookConcurrently(students) {
  const pages = await Promise.all(
    students.map(async (s) => {
      const ctx = await browser.newContext();
      await ctx.addCookies(s.cookies);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/classes/${target.id}`, { waitUntil: "domcontentloaded" });
      return { page, ctx };
    }),
  );

  // Fire every submit in the same tick — this is the whole point of the test.
  await Promise.all(
    pages.map(({ page }) =>
      page
        .getByRole("button", { name: /book my place|join the waitlist/i })
        .first()
        .click({ timeout: 15000 })
        .catch(() => undefined),
    ),
  );

  await Promise.all(pages.map(({ page }) => page.waitForTimeout(2500)));
  await Promise.all(pages.map(({ ctx }) => ctx.close()));
}

await bookConcurrently(students);

const { rows: confirmed } = await db.execute({
  sql: "select count(*) as n from bookings where session_id = ? and status = 'CONFIRMED'",
  args: [target.id],
});
const { rows: waitlisted } = await db.execute({
  sql: "select count(*) as n from bookings where session_id = ? and status = 'WAITLISTED'",
  args: [target.id],
});
const confirmedN = Number(confirmed[0].n);
const waitlistedN = Number(waitlisted[0].n);

check(
  "capacity holds under concurrent booking",
  confirmedN <= 1,
  `${confirmedN} confirmed on a 1-seat class (was 5 before the fix)`,
);
check(
  "losers are waitlisted rather than dropped",
  confirmedN + waitlistedN > 1,
  `${confirmedN} confirmed + ${waitlistedN} waitlisted`,
);

const { rows: positions } = await db.execute({
  sql: `select waitlist_position as p from bookings
         where session_id = ? and status = 'WAITLISTED' order by p`,
  args: [target.id],
});
const posList = positions.map((r) => Number(r.p));
check(
  "waitlist positions are unique",
  new Set(posList).size === posList.length,
  `positions: [${posList.join(", ")}]`,
);

/* ------------------------------------------- credits can't go negative */

const { rows: negatives } = await db.execute(
  "select count(*) as n from enrollments where sessions_remaining < 0",
);
check(
  "no enrolment has negative credits",
  Number(negatives[0].n) === 0,
  `${negatives[0].n} negative balances`,
);

// A one-credit pass raced against itself across two different classes.
const solo = students[0];
await db.execute({
  sql: "update enrollments set sessions_remaining = 1 where student_id = ?",
  args: [solo.userId],
});
const { rows: twoSessions } = await db.execute({
  sql: `select id from class_sessions
         where offering_id = ? and status = 'SCHEDULED' and starts_at > ?
         order by starts_at asc limit 2`,
  args: [target.offeringId, Date.now() + 6 * 3600_000],
});

if (twoSessions.length === 2) {
  for (const s of twoSessions) {
    await db.execute({
      sql: "update class_sessions set capacity = 50 where id = ?",
      args: [s.id],
    });
    await db.execute({
      sql: "delete from bookings where session_id = ? and student_id = ?",
      args: [s.id, solo.userId],
    });
  }

  const ctxs = await Promise.all(
    twoSessions.map(async (s) => {
      const ctx = await browser.newContext();
      await ctx.addCookies(solo.cookies);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/classes/${s.id}`, { waitUntil: "domcontentloaded" });
      return { page, ctx };
    }),
  );
  await Promise.all(
    ctxs.map(({ page }) =>
      page
        .getByRole("button", { name: /book my place|join the waitlist/i })
        .first()
        .click({ timeout: 15000 })
        .catch(() => undefined),
    ),
  );
  await Promise.all(ctxs.map(({ page }) => page.waitForTimeout(2500)));
  await Promise.all(ctxs.map(({ ctx }) => ctx.close()));

  const { rows: bal } = await db.execute({
    sql: "select sessions_remaining as n from enrollments where student_id = ?",
    args: [solo.userId],
  });
  const { rows: mine } = await db.execute({
    sql: `select count(*) as n from bookings
           where student_id = ? and status = 'CONFIRMED' and session_id in (?, ?)`,
    args: [solo.userId, twoSessions[0].id, twoSessions[1].id],
  });
  check(
    "one credit buys exactly one seat under a race",
    Number(bal[0].n) >= 0 && Number(mine[0].n) <= 1,
    `balance=${bal[0].n}, confirmed=${mine[0].n}`,
  );
}

await browser.close();

/* ------------------------------------------------------------- summary */

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
