/**
 * Environment configuration.
 *
 * Every third-party integration has a `mock` implementation, so the app runs
 * end-to-end with an empty .env. Flip a provider to its real value and supply
 * the matching keys when you're ready to go live.
 */

function optional(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Personalise",
  appUrl: process.env.APP_URL || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",

  authSecret:
    optional("AUTH_SECRET") ||
    // Dev-only fallback so `npm run dev` works with no .env at all.
    // assertProviderConfig() refuses to boot production with this value.
    "dev-only-insecure-secret-change-me-in-production-0000",

  /** mock | livekit */
  liveProvider: (optional("LIVE_PROVIDER") || "mock") as "mock" | "livekit",
  livekit: {
    url: optional("LIVEKIT_URL"),
    apiKey: optional("LIVEKIT_API_KEY"),
    apiSecret: optional("LIVEKIT_API_SECRET"),
  },

  /** mock | razorpay */
  paymentProvider: (optional("PAYMENT_PROVIDER") || "mock") as "mock" | "razorpay",
  razorpay: {
    keyId: optional("RAZORPAY_KEY_ID"),
    keySecret: optional("RAZORPAY_KEY_SECRET"),
    webhookSecret: optional("RAZORPAY_WEBHOOK_SECRET"),
  },

  /** console | resend */
  notifyProvider: (optional("NOTIFY_PROVIDER") || "console") as "console" | "resend",
  resendApiKey: optional("RESEND_API_KEY"),
  fromEmail: optional("FROM_EMAIL") || "no-reply@personalise.local",

  cronSecret: optional("CRON_SECRET"),

  /**
   * Whether students can pay online from inside the app.
   *
   * Off by default. While it's off, students see the prices but pay their
   * instructor directly (cash, UPI, bank transfer) and the instructor records
   * it in Studio → Fees, which activates the pass. That's the mode a pilot
   * runs in before the payment gateway is live.
   *
   * This defaults to OFF deliberately: the mock payment provider signs its own
   * confirmation, so an app deployed with online payments on but no real
   * gateway configured would hand out genuine free passes.
   */
  onlinePayments: (optional("ONLINE_PAYMENTS") || "off").toLowerCase() === "on",

  /**
   * The platform's cut of online payments, as a percentage. Used by the admin
   * payout report to work out what each instructor is owed. Offline (cash)
   * payments are excluded — that money never passed through the platform.
   */
  platformFeePercent: (() => {
    const v = Number(optional("PLATFORM_FEE_PERCENT"));
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
  })(),
};

export const DEV_AUTH_SECRET_FALLBACK =
  "dev-only-insecure-secret-change-me-in-production-0000";

/**
 * Fails the boot rather than serving something unsafe.
 *
 * Called from instrumentation.ts, which Next runs once per server start. Every
 * check here is something that previously produced a silently-broken
 * production deploy: the app came up healthy, served traffic, and only
 * revealed the problem when a real user lost money or an attacker walked in.
 */
export function assertProviderConfig() {
  const problems: string[] = [];
  // `npm run build && npm run start` on a laptop is NODE_ENV=production but
  // isn't a deployment, and the production rules below would (correctly)
  // refuse to boot it. This escape hatch exists only for that — it is never
  // set on a real host, and the startup banner says so out loud.
  const localOverride = optional("ALLOW_INSECURE_CONFIG") === "1";
  const isProd = env.nodeEnv === "production" && !localOverride;

  if (localOverride && env.nodeEnv === "production") {
    console.warn(
      "[personalise] ALLOW_INSECURE_CONFIG=1 — production safety checks are " +
        "DISABLED. Never set this on a deployed environment.",
    );
  }

  if (env.liveProvider === "livekit") {
    if (!env.livekit.url) problems.push("LIVEKIT_URL");
    if (!env.livekit.apiKey) problems.push("LIVEKIT_API_KEY");
    if (!env.livekit.apiSecret) problems.push("LIVEKIT_API_SECRET");
  }
  if (env.paymentProvider === "razorpay") {
    if (!env.razorpay.keyId) problems.push("RAZORPAY_KEY_ID");
    if (!env.razorpay.keySecret) problems.push("RAZORPAY_KEY_SECRET");
  }
  if (env.notifyProvider === "resend") {
    if (!env.resendApiKey) problems.push("RESEND_API_KEY");
    if (!optional("FROM_EMAIL")) problems.push("FROM_EMAIL");
  }

  if (isProd) {
    // Sessions are JWTs signed with this. Left at the committed default,
    // anyone who has read the repo can mint an admin cookie.
    if (!optional("AUTH_SECRET")) problems.push("AUTH_SECRET (required in production)");
    else if (env.authSecret === DEV_AUTH_SECRET_FALLBACK)
      problems.push("AUTH_SECRET (still set to the development default)");
    else if (env.authSecret.length < 32)
      problems.push("AUTH_SECRET (must be at least 32 characters)");

    // A file-backed SQLite database on a serverless host writes into a
    // container that is thrown away — bookings and payments vanish on the
    // next cold start, with no error anywhere.
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) problems.push("DATABASE_URL (required in production)");
    else if (dbUrl.startsWith("file:"))
      problems.push("DATABASE_URL (file-backed SQLite is not durable in production)");

    // Unset means the cron routes authenticate nobody and are open to the
    // internet, including the one that sends email.
    if (!env.cronSecret) problems.push("CRON_SECRET (required in production)");

    // The mock provider signs its own payment confirmations, so leaving it on
    // in production hands out genuine free passes.
    if (env.onlinePayments && env.paymentProvider === "mock") {
      problems.push(
        "PAYMENT_PROVIDER (cannot be 'mock' while ONLINE_PAYMENTS=on — it grants free passes)",
      );
    }
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start — invalid configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
