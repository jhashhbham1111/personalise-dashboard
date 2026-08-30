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
  await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
  if (intent === "teach") {
    await page.getByRole("button", { name: /i want to teach/i }).click();
  }
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  if (phone) await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/verify-email**", { timeout: 20000 });

  const code = await verificationCodeFor(db, email);
  if (!code) throw new Error(`No verification code was issued for ${email}`);

  await page.fill('input[name="code"]', code);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/verify-email"), {
    timeout: 20000,
  });

  return { email, code };
}
