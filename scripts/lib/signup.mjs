/**
 * Shared signup helper for the smoke suites.
 *
 * Signup no longer ends at the dashboard — it ends at a 6-digit code emailed
 * to the address. Every suite that creates a throwaway student now has to
 * clear that gate, and doing it inline in each one is how six copies of the
 * same code drift apart. It lives here instead.
 *
 * The plaintext code is never stored, so it's recovered by hashing the million
 * possibilities against the stored digest. That reads alarming and is actually
 * the reassuring part: a test with full database access still can't read the
 * code out of a column, because it isn't in one.
 */

import { createHash } from "node:crypto";

/** The domain throwaway test accounts use. Not a reserved one — those are refused. */
export const TEST_EMAIL_DOMAIN = "koshcloud.com";

/** A unique address for one test run. */
export function testEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * Skip the launch screen and first-run intro for a browser context.
 *
 * Both are full-screen overlays shown to a first-time visitor: SplashScreen
 * covers the viewport for its first ~850ms, and OnboardingCarousel sits over
 * the homepage until a signed-out visitor dismisses it. A suite that lands on
 * a page and clicks straight away is then clicking the overlay, which reads as
 * "the button does nothing" rather than "something is in front of it".
 *
 * Marking both as seen is exactly the state of a returning visitor, so this
 * skips them rather than faking anything; each is covered by its own checks.
 * Call once per context, before the first navigation.
 */
export async function skipFirstRunScreens(context) {
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("personalise:splash-seen", "1");
      localStorage.setItem("personalise:onboarded", "1");
    } catch {
      // Private modes throw on both; nothing else to do here.
    }
  });
}

/**
 * Apply the above to every page a browser opens, for the rest of the run.
 *
 * `browser.newPage()` gives each page its own context, so a per-context call
 * has to be repeated at every call site — and the one that gets forgotten
 * fails as a timeout on an unrelated button, thirty seconds later, blaming a
 * feature that works. Wrapping the factory once removes that whole class of
 * mistake. Call it immediately after launching.
 */
export function skipFirstRunScreensEverywhere(browser) {
  const open = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await open(...args);
    await skipFirstRunScreens(page.context());
    return page;
  };
  const context = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const ctx = await context(...args);
    await skipFirstRunScreens(ctx);
    return ctx;
  };
}

/** The live verification code for an address, or null if none is outstanding. */
export async function verificationCodeFor(db, email) {
  const { rows } = await db.execute({
    sql: `select c.code_hash from email_verification_codes c
            join users u on u.id = c.user_id
           where u.email = ? and c.consumed_at is null
           order by c.created_at desc limit 1`,
    args: [email.toLowerCase()],
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

/**
 * Fill the signup form, then clear the verification screen.
 *
 * Leaves the page wherever verification lands it — the dashboard for a
 * student, instructor onboarding for a teacher — which is where each suite
 * used to find itself straight after submitting the form.
 */
export async function signUpAndVerify(
  page,
  db,
  { baseUrl, name, email, password = "password123", phone, intent = "learn" },
) {
  // Idempotent, so calling it per signup is harmless.
  await skipFirstRunScreens(page.context());

  await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
  if (intent === "teach") {
    await page.getByRole("button", { name: /i want to teach/i }).click();
  }
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  if (phone) await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="accept"]');
  await page.click('button[type="submit"]');

  await page.waitForURL("**/verify-email**", { timeout: 20000 });

  const code = await verificationCodeFor(db, email);
  if (!code) throw new Error(`No verification code was issued for ${email}`);

  /*
   * Filling the box is the whole interaction — the sixth digit submits the
   * form itself, so there is no button to press.
   *
   * Clicking one anyway is not merely redundant, it fails: the submit button
   * disables while the action is in flight, so the click waits on a disabled
   * element until it is torn down by the navigation that was already running.
   */
  await page.fill('input[name="code"]', code);
  await page.waitForURL((u) => !u.pathname.startsWith("/verify-email"), {
    timeout: 20000,
  });

  return { email, code };
}
