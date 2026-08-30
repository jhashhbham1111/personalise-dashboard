import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import { db, emailVerificationCodes, users } from "@/db";
import { env } from "./env";
import { sendEmail } from "./notify";

/**
 * Email verification.
 *
 * Signup used to accept anything shaped like an address, which cost two real
 * things: a student who typo'd their email had no working password reset and
 * no booking confirmations, and anyone could register `a@b.com` in bulk. A
 * code the person has to read out of their inbox fixes both, because it can
 * only be answered by someone who actually receives mail there.
 *
 * Six digits rather than a link because most signups happen on a phone, where
 * a link means leaving the browser for the mail app and hoping the session
 * survives the round trip. The code can be typed into the tab that's already
 * open. The link's security property — that only the mailbox owner can pass —
 * is preserved by keeping the code short-lived and the guesses few.
 *
 * Only the SHA-256 digest is stored, as with password reset tokens: a dump of
 * this table gives an attacker nothing they can enter into the form.
 */

const CODE_TTL_MINUTES = 15;
/** Wrong guesses allowed before the code is burned and a new one is needed. */
const MAX_ATTEMPTS = 5;

function digest(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * randomInt, not Math.random. A predictable code is not a code — anyone who
 * can guess the seed can verify an address they don't own.
 */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Digits only, so "123 456" and "123-456" both work when pasted. */
export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/**
 * Issue a fresh code and email it.
 *
 * Any earlier unconsumed code for this user stops working, so an old email
 * still sitting in an inbox can't be used after a new one is requested — and
 * so the attempt counter can't be reset by simply asking for another code
 * while keeping the old one alive.
 */
export async function issueVerificationCode(user: {
  id: string;
  email: string;
  name: string;
}): Promise<void> {
  await db
    .update(emailVerificationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(emailVerificationCodes.userId, user.id),
        isNull(emailVerificationCodes.consumedAt),
      ),
    );

  const code = generateCode();

  await db.insert(emailVerificationCodes).values({
    userId: user.id,
    email: user.email,
    codeHash: digest(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  await sendEmail({
    to: user.email,
    subject: `${code} is your ${env.appName} verification code`,
    body: [
      `Hi ${user.name},`,
      "",
      `Your ${env.appName} verification code is:`,
      "",
      `    ${code}`,
      "",
      `It expires in ${CODE_TTL_MINUTES} minutes.`,
      "",
      "If you didn't try to create an account, you can ignore this email —",
      "nothing happens until the code is entered.",
    ].join("\n"),
  });
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string; exhausted?: boolean };

/**
 * Check a code and, if it matches, mark the account verified.
 *
 * The attempt counter is incremented before the comparison, so a crash or a
 * dropped connection mid-check still costs the caller a guess. Comparison is
 * timing-safe: a check that returns faster for a nearly-right code leaks the
 * code one digit at a time.
 */
export async function verifyEmailCode(args: {
  userId: string;
  code: string;
}): Promise<VerifyResult> {
  const code = normaliseCode(args.code);
  if (code.length !== 6) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const [row] = await db
    .select({
      id: emailVerificationCodes.id,
      email: emailVerificationCodes.email,
      codeHash: emailVerificationCodes.codeHash,
      expiresAt: emailVerificationCodes.expiresAt,
      attempts: emailVerificationCodes.attempts,
    })
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.userId, args.userId),
        isNull(emailVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      exhausted: true,
      error: "That code has expired. Send yourself a new one.",
    };
  }

  if (row.expiresAt < new Date()) {
    await db
      .update(emailVerificationCodes)
      .set({ consumedAt: new Date() })
      .where(eq(emailVerificationCodes.id, row.id));
    return {
      ok: false,
      exhausted: true,
      error: "That code has expired. Send yourself a new one.",
    };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .update(emailVerificationCodes)
      .set({ consumedAt: new Date() })
      .where(eq(emailVerificationCodes.id, row.id));
    return {
      ok: false,
      exhausted: true,
      error: "Too many wrong codes. Send yourself a new one.",
    };
  }

  await db
    .update(emailVerificationCodes)
    .set({ attempts: sql`${emailVerificationCodes.attempts} + 1` })
    .where(eq(emailVerificationCodes.id, row.id));

  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(digest(code), "hex");
  const matches = a.length === b.length && timingSafeEqual(a, b);

  if (!matches) {
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    if (left <= 0) {
      await db
        .update(emailVerificationCodes)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationCodes.id, row.id));
      return {
        ok: false,
        exhausted: true,
        error: "Too many wrong codes. Send yourself a new one.",
      };
    }
    return {
      ok: false,
      error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  // Spent with a conditional UPDATE, so a double-submitted form can't be
  // replayed against a code someone else is racing to guess.
  const spend = await db.run(sql`
    UPDATE email_verification_codes
       SET consumed_at = ${Date.now()}
     WHERE id = ${row.id}
       AND consumed_at IS NULL
  `);
  if (spend.rowsAffected === 0) {
    return {
      ok: false,
      exhausted: true,
      error: "That code has already been used. Send yourself a new one.",
    };
  }

  // Guarded on the address the code was issued for: if the account's email
  // changed between sending and entering, this code proves nothing about the
  // address now on the account.
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, args.userId), eq(users.email, row.email)));

  return { ok: true };
}

/** Housekeeping — spent and expired rows have no value and shouldn't pile up. */
export async function sweepExpiredVerificationCodes(): Promise<void> {
  await db
    .delete(emailVerificationCodes)
    .where(
      lt(emailVerificationCodes.expiresAt, new Date(Date.now() - 86_400_000)),
    );
}
