/**
 * Smoke test for direct messages between a student and their instructor.
 *
 * Shubham's messaging PR arrived without one, and the interesting part isn't
 * that a message renders — it is who is allowed to start a conversation at
 * all. A platform where any account can message any instructor is a spam
 * surface, so the enrolment gate is asserted here alongside the round trip.
 *
 *   node scripts/chat-smoke.mjs
 *
 * Expects `npm run dev` on localhost:3000 against dev.db.
 */

import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { signUpAndVerify, testEmail, skipFirstRunScreensEverywhere } from "./lib/signup.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = createClient({ url: "file:./dev.db" });
let passed = 0, failed = 0;
const check = (l, ok, d = "") => {
  if (ok) { passed++; console.log(`  PASS  ${l}${d ? ` — ${d}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${l}${d ? ` — ${d}` : ""}`); }
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

const browser = await chromium.launch();
skipFirstRunScreensEverywhere(browser);

try {
  /* ------------------- an enrolled student can reach their instructor */
  console.log("\nA student who has enrolled can open a conversation");
  const student = await browser.newPage();
  await login(student, "student@personalise.app");
  await student.goto(`${BASE}/dashboard/messages`, { waitUntil: "networkidle" });
  check("the student's messages page opens", student.url().includes("/dashboard/messages"));

  const seesInstructor = await student.locator('a[href^="/dashboard/messages/"]').first()
    .waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  check("their instructor is listed", seesInstructor);

  if (seesInstructor) {
    await student.locator('a[href^="/dashboard/messages/"]').first().click();
    await student.waitForURL(/\/dashboard\/messages\/.+/, { timeout: 15000 }).catch(() => {});
    const body = student.locator('textarea, input[name="body"]').first();
    await body.waitFor({ state: "visible", timeout: 10000 });
    const note = `ping from the student ${Date.now()}`;
    await body.fill(note);
    await student.getByRole("button", { name: /^Send to / }).click();
    const echoed = await student.getByText(note).first()
      .waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    check("the message appears in their own thread", echoed);

    /* ------------------------- and the instructor receives it */
    console.log("\nThe instructor sees it and can reply");
    const instructor = await browser.newPage();
    await login(instructor, "ananya@personalise.app");
    await instructor.goto(`${BASE}/studio/messages`, { waitUntil: "networkidle" });
    // The row is a link; matching on the name alone also hits the message
    // preview text and the nav, neither of which navigates anywhere.
    const row = instructor.locator('a[href^="/studio/messages/"]').first();
    const listed = await row.waitFor({ state: "visible", timeout: 10000 })
      .then(() => true).catch(() => false);
    check("the student is listed in the studio inbox", listed);

    if (listed) {
      await row.click();
      await instructor.waitForURL(/\/studio\/messages\/.+/, { timeout: 15000 }).catch(() => {});
      const got = await instructor.getByText(note).first()
        .waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
      check("the student's message arrived", got, got ? "" : "not visible to the instructor");

      const reply = `reply from the instructor ${Date.now()}`;
      const rbox = instructor.locator('textarea, input[name="body"]').first();
      await rbox.fill(reply);
      await instructor.getByRole("button", { name: /^Send to / }).click();
      await instructor.getByText(reply).first()
        .waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

      // The thread polls, so the student's open page should pick this up
      // without a reload — that is the whole point of loadMessagesSince.
      const arrived = await student.getByText(reply).first()
        .waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
      check("the reply reaches the student's open thread", arrived,
        arrived ? "without a reload" : "did not poll through");
    }
    await instructor.close();
  }
  await student.close();

  /* ------------- a stranger cannot start a conversation out of nowhere */
  console.log("\nSomeone who never enrolled cannot start a conversation");
  {
    const strangerPage = await browser.newPage();
    const email = testEmail("chat-stranger");
    await signUpAndVerify(strangerPage, db, { baseUrl: BASE, name: "Chat Stranger", email });

    const { rows } = await db.execute("select id from instructor_profiles limit 1");
    const instructorId = rows[0].id;
    await strangerPage.goto(`${BASE}/dashboard/messages/${instructorId}`, { waitUntil: "networkidle" });

    const text = await strangerPage.locator("body").innerText();
    const refused =
      !strangerPage.url().includes(`/messages/${instructorId}`) ||
      /once you.{0,3}ve enrolled|not found|couldn.t open/i.test(text);
    check("a never-enrolled account is refused", refused,
      refused ? "" : `landed on ${strangerPage.url()}`);

    const { rows: convs } = await db.execute({
      sql: "select count(*) as n from conversations c join users u on u.id = c.student_id where u.email = ?",
      args: [email.toLowerCase()],
    });
    check("and no conversation row was created for them", Number(convs[0].n) === 0,
      `${convs[0].n} row(s)`);
    await strangerPage.close();
    await db.execute({ sql: "delete from users where email = ?", args: [email.toLowerCase()] });
  }
} finally {
  await browser.close();
  db.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
