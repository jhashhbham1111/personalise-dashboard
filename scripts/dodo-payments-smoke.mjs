/**
 * Dodo Payments integration.
 *
 * Two things worth being sure about, neither of which needs a live Dodo
 * account or network access to verify:
 *
 *   1. The enrolment-resolution fix. Before this round, `grantEnrollment`
 *      recovered what a payment bought by splitting its invoice description
 *      back into "<offering title> — <plan name>" and matching the offering
 *      by *title*. Two offerings sharing a title — plausible the moment two
 *      instructors both call a class "Morning Flow", or even one instructor
 *      reusing a name — meant a payment could silently grant access to the
 *      wrong class. `payments.planId`, set once at checkout time, replaces
 *      the guesswork. This suite manufactures exactly that collision and
 *      proves the right offering wins regardless of insertion order.
 *   2. The Dodo webhook signature check. Dodo signs webhooks with the
 *      Standard Webhooks scheme (the same one Svix uses) — a different shape
 *      of proof than Razorpay's single HMAC-hex header, so it earns its own
 *      test: a correctly-signed payload is accepted, and a tampered body, a
 *      wrong secret, a stale timestamp and missing headers are all rejected.
 *
 * Both need real backend modules (`src/lib/checkout.ts` and friends) that
 * import Next's `server-only` marker, which throws unless the process
 * resolves the `react-server` export condition — that's what the
 * `--conditions=react-server` flag below buys, and it's why this needs `node`
 * with `--import tsx`, not a plain `node scripts/…` invocation. Each check
 * below runs in its own child process because PAYMENT_PROVIDER is read once,
 * at module load, and the two checks need it set differently.
 *
 *   node scripts/dodo-payments-smoke.mjs
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv.find((a) => a.startsWith("--child="))?.split("=")[1];

if (!mode) {
  const results = [];
  for (const m of ["enrollment-fix", "webhook"]) {
    console.log(`\n== ${m} ==`);
    results.push(await runChild(m));
  }
  const failed = results.some((code) => code !== 0);
  console.log(failed ? "\nFAILED" : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

function runChild(childMode) {
  return new Promise((resolve) => {
    const self = fileURLToPath(import.meta.url);
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", self, `--child=${childMode}`],
      { stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/* --------------------------------------------------------------- shared */

const results = [];
function check(name, passed, detail = "") {
  results.push(passed);
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function finish() {
  process.exit(results.every(Boolean) ? 0 : 1);
}

/* ------------------------------------------------- enrolment-fix child */

if (mode === "enrollment-fix") {
  await import("dotenv/config");
  process.env.ONLINE_PAYMENTS = "on";
  process.env.PAYMENT_PROVIDER = "mock";

  const { db, offerings, pricingPlans, payments, enrollments } =
    await import("../src/db/index.ts");
  const { startCheckout, fulfilPayment } = await import("../src/lib/checkout.ts");
  const { eq } = await import("drizzle-orm");

  const instructor = await db.query.instructorProfiles.findFirst();
  const student = await db.query.users.findFirst({
    where: (u, { eq: e }) => e(u.role, "STUDENT"),
  });
  check("found a seeded instructor and a student to test against", !!instructor && !!student);
  if (!instructor || !student) finish();

  const stamp = Date.now().toString(36);
  const sharedTitle = `Dodo Regression Twin ${stamp}`;

  const [offeringA] = await db
    .insert(offerings)
    .values({ instructorId: instructor.id, title: sharedTitle, slug: `dodo-regr-a-${stamp}` })
    .returning();
  const [offeringB] = await db
    .insert(offerings)
    .values({ instructorId: instructor.id, title: sharedTitle, slug: `dodo-regr-b-${stamp}` })
    .returning();

  // Same plan *name* too — the old code matched on name within whichever
  // offering the title lookup happened to return, so a name collision alone
  // wouldn't have been enough to catch it. The title collision is the part
  // that mattered.
  const [planA] = await db
    .insert(pricingPlans)
    .values({ offeringId: offeringA.id, name: "Test Plan", amountPaise: 11100, sessionsIncluded: 3 })
    .returning();
  const [planB] = await db
    .insert(pricingPlans)
    .values({ offeringId: offeringB.id, name: "Test Plan", amountPaise: 22200, sessionsIncluded: 7 })
    .returning();
  void planA;

  // offeringA was inserted first — under the old title-lookup code,
  // `db.query.offerings.findFirst({ where: eq(title, sharedTitle) })` returns
  // whichever row SQLite hands back first, which for a plain unindexed match
  // is insertion order. Paying for offeringB's plan while offeringA exists is
  // exactly the case that used to grant the wrong class.
  const started = await startCheckout({ studentId: student.id, planId: planB.id });
  check("checkout starts", started.ok, started.ok ? "" : started.error);
  if (!started.ok) finish();

  const paymentBeforeFulfil = await db.query.payments.findFirst({
    where: eq(payments.id, started.paymentId),
  });
  check(
    "payment row carries the plan id at checkout time",
    paymentBeforeFulfil?.planId === planB.id,
  );

  const fulfilled = await fulfilPayment({
    paymentId: started.paymentId,
    providerPaymentId: "test_pay_" + stamp,
    method: "UPI",
  });
  check("fulfilment succeeds", fulfilled.ok, fulfilled.ok ? "" : fulfilled.error);
  if (!fulfilled.ok || !fulfilled.enrollmentId) finish();

  const enrollment = await db.query.enrollments.findFirst({
    where: eq(enrollments.id, fulfilled.enrollmentId),
  });

  check(
    "enrolment points at the offering actually paid for, not the title-collision sibling",
    enrollment?.offeringId === offeringB.id,
    `got ${enrollment?.offeringId}, wanted ${offeringB.id} (offeringA was ${offeringA.id})`,
  );
  check("enrolment points at the exact plan paid for", enrollment?.planId === planB.id);
  check(
    "session count matches the paid plan, not the sibling with the same name",
    enrollment?.sessionsRemaining === 7,
    `got ${enrollment?.sessionsRemaining}`,
  );

  finish();
}

/* ------------------------------------------------------------- webhook child */

if (mode === "webhook") {
  await import("dotenv/config");
  const TEST_SECRET_RAW = "dodo-payments-smoke-test-secret-do-not-use";
  process.env.PAYMENT_PROVIDER = "dodo";
  process.env.DODO_PAYMENTS_API_KEY = "test_key";
  process.env.DODO_PRODUCT_ID = "test_product";
  process.env.DODO_PAYMENTS_WEBHOOK_KEY =
    "whsec_" + Buffer.from(TEST_SECRET_RAW).toString("base64");

  const { dodoProvider } = await import("../src/lib/payments/dodo.ts");
  const { createHmac } = await import("node:crypto");

  function sign(id, timestamp, body, secretB64 = Buffer.from(TEST_SECRET_RAW).toString("base64")) {
    const key = Buffer.from(secretB64, "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return `v1,${expected}`;
  }

  const id = "msg_smoke_test";
  const now = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    type: "payment.succeeded",
    data: { payload_type: "Payment", payment_id: "pay_test", metadata: { referenceId: "pay_row_1" } },
  });

  check(
    "a correctly signed payload verifies",
    dodoProvider.verifyWebhookSignature(body, {
      "webhook-id": id,
      "webhook-timestamp": String(now),
      "webhook-signature": sign(id, now, body),
    }),
  );

  check(
    "a tampered body is rejected",
    !dodoProvider.verifyWebhookSignature(body + " ", {
      "webhook-id": id,
      "webhook-timestamp": String(now),
      "webhook-signature": sign(id, now, body),
    }),
  );

  check(
    "a signature made with the wrong secret is rejected",
    !dodoProvider.verifyWebhookSignature(body, {
      "webhook-id": id,
      "webhook-timestamp": String(now),
      "webhook-signature": sign(id, now, body, Buffer.from("wrong-secret").toString("base64")),
    }),
  );

  const stale = now - 600; // 10 minutes old — outside the 5-minute tolerance
  check(
    "a stale timestamp is rejected even with a matching signature",
    !dodoProvider.verifyWebhookSignature(body, {
      "webhook-id": id,
      "webhook-timestamp": String(stale),
      "webhook-signature": sign(id, stale, body),
    }),
  );

  check(
    "missing signature headers are rejected, not treated as valid",
    !dodoProvider.verifyWebhookSignature(body, { "webhook-id": id, "webhook-timestamp": String(now) }),
  );

  finish();
}
