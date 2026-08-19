import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "./env";

/**
 * Shared bearer-token check for the cron endpoints.
 *
 * Fails closed. These routes previously used `if (cronSecret) { check }`, so
 * forgetting to set the secret didn't loosen the check — it removed it, and
 * left an endpoint that sends email open to anyone who found the URL.
 *
 * Compared over SHA-256 digests so the comparison is both fixed-length (what
 * timingSafeEqual requires) and constant-time.
 */
export function authorizeCron(request: Request):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  if (!env.cronSecret) {
    return {
      ok: false,
      status: 503,
      error:
        "CRON_SECRET is not configured, so this endpoint is disabled. Set it and redeploy.",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(env.cronSecret).digest();
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
