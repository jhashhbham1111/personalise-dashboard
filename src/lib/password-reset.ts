import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";

import { db, passwordResetTokens, users } from "@/db";
import { hashPassword } from "./auth";
import { env } from "./env";
import { sendEmail } from "./notify";

/**
 * Password reset.
 *
 * Before this existed, a forgotten password meant someone with database access
 * had to hand-write a bcrypt hash into the users table. That is not a support
 * process, it's a bottleneck with a person in it, and it fails the moment the
 * platform has more users than the founder can personally rescue.
 *
 * The token is a random 32-byte secret sent by email; only its SHA-256 digest
 * is stored, so a leaked database gives an attacker nothing they can redeem.
 */

const TOKEN_TTL_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a reset link.
 *
 * Always resolves the same way whether or not the address belongs to an
 * account: telling an anonymous caller which emails are registered turns this
 * endpoint into a user-enumeration oracle.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return;

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);
  if (!user) return;

  // Any earlier unused token stops working, so a reset link forwarded to the
  // wrong person can't be used after the real owner requests a fresh one.
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        isNull(passwordResetTokens.usedAt),
      ),
    );

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: digest(token),
    expiresAt,
  });

  const link = `${env.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: "Reset your Personalise password",
    body: [
      `Hi ${user.name},`,
      "",
      "Someone asked to reset the password on your Personalise account.",
      "Open this link to choose a new one:",
      "",
      link,
      "",
      `The link stops working in ${TOKEN_TTL_MINUTES} minutes.`,
      "If this wasn't you, ignore this email — your password hasn't changed.",
    ].join("\n"),
  });
}

type TokenRow = { id: string; userId: string };

/**
 * Resolve a token to its row, or null.
 *
 * Compares digests with a timing-safe equality even though the lookup is by
 * indexed digest — the query itself already leaks little, and this keeps the
 * comparison honest if the lookup strategy ever changes.
 */
async function resolveToken(token: string): Promise<TokenRow | null> {
  if (!token) return null;
  const hash = digest(token);

  const [row] = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      tokenHash: passwordResetTokens.tokenHash,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hash))
    .limit(1);

  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;

  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { id: row.id, userId: row.userId };
}

/** Whether a reset link is still good, for rendering the form or an error. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  return (await resolveToken(token)) !== null;
}

/**
 * Set a new password and consume the token.
 *
 * The token is spent with a conditional UPDATE before the password is written,
 * so a double-submitted form can't be replayed.
 */
export async function completePasswordReset(args: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (args.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const row = await resolveToken(args.token);
  if (!row) {
    return {
      ok: false,
      error: "That reset link has expired or already been used. Request a new one.",
    };
  }

  const spend = await db.run(sql`
    UPDATE password_reset_tokens
       SET used_at = ${Date.now()}
     WHERE id = ${row.id}
       AND used_at IS NULL
  `);
  if (spend.rowsAffected === 0) {
    return {
      ok: false,
      error: "That reset link has already been used. Request a new one.",
    };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(args.password) })
    .where(eq(users.id, row.userId));

  return { ok: true };
}

/** Housekeeping — expired rows have no value and shouldn't accumulate. */
export async function sweepExpiredResetTokens(): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, new Date(Date.now() - 86_400_000)));
}
