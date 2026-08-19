/**
 * Runs once when the server starts, before it accepts any traffic.
 *
 * Configuration problems used to surface as a broken checkout or a forged
 * session weeks later. Checking here means a misconfigured deploy fails at
 * boot — loudly, in the deployment log — instead of coming up healthy and
 * quietly doing the wrong thing.
 */
export async function register() {
  // Only the Node.js server runtime has the full environment; the edge
  // runtime re-runs this file with a different subset.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertProviderConfig, env } = await import("@/lib/env");
  assertProviderConfig();

  if (env.nodeEnv === "production" && !env.onlinePayments) {
    console.info(
      "[personalise] Online payments are OFF. Students pay their instructor directly; " +
        "instructors activate passes from Studio → Fees.",
    );
  }
}
