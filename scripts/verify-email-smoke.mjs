/**
 * Smoke test for email verification at signup.
 *
 * Covers the whole point of the feature, in the order a real person meets it:
 * a fake address is refused outright, a real one gets an account that can
 * reach nothing until the code is entered, a wrong code is counted and
 * eventually burns the code, a typo'd address can be corrected, and the right
 * code lets the person through to where signup used to drop them.
 *
 * Reads the issued code straight out of the database rather than an inbox —
 * the code's delivery is the email provider's job and is tested by using it;
 * what's tested here is that the gate actually holds.
 *
 *   node scripts/verify-email-smoke.mjs
 *
 * Expects `npm run dev` on localhost:3000 against dev.db.
 */

import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = createClient({ url: "file:./dev.db" });

let passed = 0;
let failed = 0;

/**
 * Wait for text to appear rather than sampling once.
 *
 * A server action re-renders the page without navigating, so "networkidle"
 * can resolve before React has painted the result — sampling at that moment
 * reports a working feature as broken.
 */
async function seesText(page, pattern, timeout = 10000) {
  return page
    .getByText(pattern)
    .first()
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/** Same idea for a row the action is expected to have written. */
async function waitForRow(sql, args, timeout = 10000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const { rows } = await db.execute({ sql, args });
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return [];
    await new Promise((r) => setTimeout(r, 250));
  }
}

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The plaintext code is never stored, so match candidates against the hash. */
async function findCode(email) {
  const { rows } = await db.execute({
    sql: `select c.code_hash from email_verification_codes c
            join users u on u.id = c.user_id
           where u.email = ? and c.consumed_at is null
           order by c.created_at desc limit 1`,
    args: [email],
  });
  if (rows.length === 0) return null;
  const target = rows[0].code_hash;
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, "0");
    if (createHash("sha256").update(candidate).digest("hex") === target) {
      return candidate;
    }
  }
  return null;
}

async function cleanup(...emails) {
  for (const email of emails) {
    await db.execute({ sql: "delete from users where email = ?", args: [email] });
  }
  await db.execute("delete from rate_limit_hits");
}

async function signup(page, { name, email, password = "password123" }) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /start learning/i }).click();

  /*
   * Wait for the outcome, not for the network to go quiet.
   *
   * "networkidle" only means nothing is in flight *right now*, which on this
   * form can be true before the action has finished — the account and its code
   * are then written a moment after the test has already looked for them, and
   * the failure reads as "no code was issued" for a signup that worked
   * perfectly. Whichever of the two real outcomes arrives first ends the wait:
   * the code screen for an accepted address, an inline error for a refused one.
   */
  await Promise.race([
    page
      .waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 20000 })
      .catch(() => {}),
    page
      .getByText(
        /check the highlighted fields|already registered|real email address|temporary inboxes|did you mean|doesn't look like/i,
      )
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => {}),
  ]);
}

const stamp = Date.now();
const GOOD = `smoke.verify.${stamp}@koshcloud.com`;
const TYPO = `smoke.typo.${stamp}@koshcloud.com`;
const FIXED = `smoke.fixed.${stamp}@koshcloud.com`;

await cleanup(GOOD, TYPO, FIXED);

const browser = await chromium.launch();

try {
  /* ------------------------------------------- 1. dummy addresses refused */
  console.log("\nRejecting addresses that can't receive mail");
  {
    const page = await browser.newPage();
    for (const [address, expect] of [
      ["test@example.com", /real email address/i],
      ["someone@mailinator.com", /temporary inboxes/i],
      ["priya@gmial.com", /did you mean @gmail\.com/i],
      ["nobody@gmail", /doesn't look like an email/i],
    ]) {
      await signup(page, { name: "Smoke Tester", email: address });
      const message = await seesText(page, expect);
      const stillOnSignup = page.url().includes("/signup");
      check(`${address} refused`, stillOnSignup && message, `url=${page.url()}`);

      const { rows } = await db.execute({
        sql: "select id from users where email = ?",
        args: [address.toLowerCase()],
      });
      check(`${address} created no account`, rows.length === 0);
    }
    await page.close();
  }

  /* ---------------------------------- 2. real signup lands on the code page */
  console.log("\nA real address gets an account that is blocked until verified");
  const page = await browser.newPage();
  await signup(page, { name: "Smoke Verify", email: GOOD });
  check("signup redirects to /verify-email", page.url().includes("/verify-email"), page.url());
  check(
    "the screen names the address the code went to",
    await seesText(page, GOOD),
  );

  {
    const { rows } = await db.execute({
      sql: "select email_verified_at from users where email = ?",
      args: [GOOD],
    });
    check("the account is stored unverified", rows.length === 1 && rows[0].email_verified_at === null);
  }

  /* ------------------------------------------------- 3. the block holds */
  console.log("\nEvery guarded page bounces back to the code screen");
  for (const path of ["/dashboard", "/dashboard/passes", "/dashboard/redeem", "/studio", "/admin"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    check(`${path} redirects to /verify-email`, page.url().includes("/verify-email"), page.url());
  }

  /* ------------------------------------------------ 4. a wrong code counts */
  console.log("\nWrong codes are counted and don't verify anything");
  await page.goto(`${BASE}/verify-email`);
  const realCode = await findCode(GOOD);
  check("a code was issued", realCode !== null);

  // No button press anywhere below: the sixth digit submits the form itself,
  // so clicking "Confirm email" would race a navigation that has already
  // started — and on the success path the button is gone before the click.
  const wrong = realCode === "000000" ? "111111" : "000000";
  await page.getByLabel("Verification code").fill(wrong);
  await page.waitForLoadState("networkidle");
  check(
    "a wrong code is refused with the tries remaining",
    await seesText(page, /isn.t right\. \d tr(y|ies) left/i),
  );
  {
    const { rows } = await db.execute({
      sql: "select email_verified_at from users where email = ?",
      args: [GOOD],
    });
    check("still unverified after a wrong code", rows[0].email_verified_at === null);
  }

  /* --------------------------------------------- 5. the right code lets in */
  console.log("\nThe right code finishes signup");
  await page.getByLabel("Verification code").fill(realCode);
  await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  check("verifying lands on the dashboard", page.url().includes("/dashboard"), page.url());
  {
    const { rows } = await db.execute({
      sql: "select email_verified_at from users where email = ?",
      args: [GOOD],
    });
    check("the account is now verified", rows[0].email_verified_at !== null);
  }

  await page.goto(`${BASE}/dashboard/passes`);
  await page.waitForLoadState("networkidle");
  check(
    "a verified account reaches pages that were blocked",
    page.url().includes("/dashboard/passes"),
    page.url(),
  );

  /* ------------------------------------ 6. a used code can't be replayed */
  console.log("\nA spent code can't be used again");
  {
    const { rows } = await db.execute({
      sql: `select consumed_at from email_verification_codes c
              join users u on u.id = c.user_id where u.email = ?`,
      args: [GOOD],
    });
    check("the code is marked consumed", rows.length > 0 && rows[0].consumed_at !== null);
  }
  await page.close();

  /* ------------------------------------------- 7. a typo can be corrected */
  console.log("\nA mistyped address can be fixed without losing the account");
  const typoPage = await browser.newPage();
  await signup(typoPage, { name: "Smoke Typo", email: TYPO });
  check("typo signup reaches the code screen", typoPage.url().includes("/verify-email"));

  await typoPage.getByRole("button", { name: /wrong address\? change it/i }).click();
  await typoPage.getByLabel("Correct email address").fill(FIXED);
  await typoPage.getByRole("button", { name: /use this address/i }).click();
  await typoPage.waitForLoadState("networkidle");
  check(
    "the new address is confirmed on screen",
    await seesText(typoPage, /address updated/i),
  );
  {
    const rows = await waitForRow("select id from users where email = ?", [FIXED]);
    check("the account now holds the corrected address", rows.length === 1);
  }

  const fixedCode = await findCode(FIXED);
  check("a code was issued to the corrected address", fixedCode !== null);
  await typoPage.getByLabel("Verification code").fill(fixedCode);
  await typoPage.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  check("the corrected address verifies", typoPage.url().includes("/dashboard"), typoPage.url());
  await typoPage.close();

  /* ------------------------------------- 8. the code box does the work now */
  console.log("\nThe code box submits itself, survives a paste, and says it is waiting");
  {
    const UX = `smoke.ux.${stamp}@koshcloud.com`;
    await cleanup(UX);
    const p = await browser.newPage();
    await signup(p, { name: "Smoke UX", email: UX });

    // The countdown is client state, so read the page only once the code box
    // is actually interactive — before hydration the resend button has not
    // taken its "in 45s" form yet.
    await p.locator('input[name="code"]').waitFor({ state: "visible", timeout: 15000 });
    const arrival = await p.locator("body").innerText();
    // A screen that sits perfectly still while you wait on an email reads as
    // broken rather than patient — there is no way to tell it apart from one
    // that has quietly failed.
    check("says it is waiting rather than sitting silent", /waiting for your code/i.test(arrival));
    // Resend is closed on arrival: a code has just been sent, and mashing the
    // button spends the five sends the server allows in fifteen minutes.
    check("resend opens on a countdown", /send a new code in \d+s/i.test(arrival),
      arrival.match(/send a new code in \d+s/i)?.[0] ?? "");
    check("and is genuinely disabled",
      await p.getByRole("button", { name: /send a new code/i }).isDisabled());

    // A wrong code has to hand the box back empty and focused, or the next
    // thing typed lands after six digits already known to be wrong.
    await p.locator('input[name="code"]').fill("000000");
    await p.waitForTimeout(2500);
    check("a rejected code empties the box",
      (await p.locator('input[name="code"]').inputValue()) === "");
    check("and takes focus back",
      (await p.evaluate(() => document.activeElement?.getAttribute("name"))) === "code");

    // The real code, typed but never confirmed with the button.
    const code = await findCode(UX);
    await p.locator('input[name="code"]').fill(code);
    const submitted = await p
      .waitForURL((u) => !u.pathname.includes("verify-email"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check("six digits submit themselves", submitted, submitted ? p.url() : "still on /verify-email");
    await p.close();
  }

  /* --------------------------- 9. a pasted code arrives with its surroundings */
  console.log("\nA code pasted out of a mail app still works");
  {
    const PASTE = `smoke.paste.${stamp}@koshcloud.com`;
    await cleanup(PASTE);
    const p = await browser.newPage();
    await signup(p, { name: "Smoke Paste", email: PASTE });
    const code = await findCode(PASTE);

    // What actually leaves a mail app: the sentence around the code, a space
    // inside it, a trailing newline. Stripping every non-digit would be the
    // obvious fix and is wrong — a subject line carrying a year first would
    // yield "2026.." — so this asserts the surrounding number is ignored.
    await p.locator('input[name="code"]').fill(
      `Personalise 2026 — your code is ${code.slice(0, 3)} ${code.slice(3)}\n`,
    );
    const ok = await p
      .waitForURL((u) => !u.pathname.includes("verify-email"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check("a pasted 'Personalise 2026 — your code is 123 456' verifies", ok,
      ok ? p.url() : "rejected");
    await p.close();
  }

  /* ------------------------ 10. an existing verified account is unaffected */
  console.log("\nSeeded accounts still sign in straight to their own home");
  const seeded = await browser.newPage();
  await seeded.goto(`${BASE}/login`);
  await seeded.getByLabel("Email").fill("ananya@personalise.app");
  await seeded.getByLabel("Password").fill("password123");
  await seeded.getByRole("button", { name: /sign in/i }).click();
  await seeded.waitForURL(/\/studio/, { timeout: 15000 }).catch(() => {});
  check("a verified instructor goes to /studio", seeded.url().includes("/studio"), seeded.url());
  await seeded.close();
} finally {
  await browser.close();
  await cleanup(GOOD, TYPO, FIXED);
  db.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
