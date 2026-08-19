import "server-only";

import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db, rateLimitHits } from "@/db";

/**
 * Fixed-window rate limiting, backed by the database.
 *
 * Deliberately not an in-memory Map: on any host that runs more than one
 * instance (or that recycles them between requests, which is the normal case
 * for serverless), a per-process counter resets constantly and limits
 * essentially nothing. A table is slower but actually holds.
 *
 * Keys are caller-supplied and should be scoped, e.g. `login:ip:1.2.3.4` and
 * `login:email:someone@example.com` — limiting both means one attacker can't
 * spray a thousand accounts from one address, and a botnet can't grind a
 * single account from a thousand addresses.
 */
export async function rateLimit(args: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const now = Date.now();
  const windowMs = args.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  // One row per key per window. The unique index makes the upsert the whole
  // operation, so two simultaneous attempts can't both read 0 and write 1.
  await db
    .insert(rateLimitHits)
    .values({ key: args.key, windowStart, hits: 1 })
    .onConflictDoUpdate({
      target: [rateLimitHits.key, rateLimitHits.windowStart],
      set: { hits: sql`${rateLimitHits.hits} + 1` },
    });

  const [row] = await db
    .select({ hits: rateLimitHits.hits })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.key, args.key),
        eq(rateLimitHits.windowStart, windowStart),
      ),
    )
    .limit(1);

  const hits = row?.hits ?? 1;
  if (hits > args.limit) {
    const resetAt = windowStart.getTime() + windowMs;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  // Opportunistic cleanup so the table doesn't grow without bound. Cheap, and
  // avoids needing yet another cron for housekeeping.
  if (Math.floor(now / 1000) % 50 === 0) {
    await db
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.windowStart, new Date(now - 24 * 3600_000)));
  }

  return { ok: true };
}

/** Clears a key's counter — call after a successful login so one typo doesn't linger. */
export async function clearRateLimit(key: string): Promise<void> {
  await db
    .delete(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.key, key),
        gt(rateLimitHits.windowStart, new Date(Date.now() - 24 * 3600_000)),
      ),
    );
}

/** Best-effort client IP from the proxy headers Vercel and most hosts set. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
