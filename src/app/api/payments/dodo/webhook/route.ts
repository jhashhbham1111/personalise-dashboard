import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, payments } from "@/db";
import { fulfilPayment } from "@/lib/checkout";
import { getPaymentProvider } from "@/lib/payments";
import { PaymentStatus } from "@/lib/enums";

/**
 * Dodo Payments webhook — the only authority on payment status.
 *
 * Dodo's checkout has no browser-signed callback the way Razorpay's does (see
 * src/lib/payments/provider.ts), so unlike the Razorpay route this one isn't a
 * fast path racing a browser confirmation — it's the *only* path. A student
 * who closes the tab mid-payment, or whose bank app takes a minute, still gets
 * their pass because this fires regardless of what the browser saw.
 *
 * Register at your Dodo dashboard → Webhooks, pointed at
 * https://your-domain/api/payments/dodo/webhook, and put the signing key in
 * DODO_PAYMENTS_WEBHOOK_KEY (it looks like `whsec_...`).
 */

type DodoWebhook = {
  type?: string;
  data?: {
    payload_type?: string;
    payment_id?: string;
    payment_method_type?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  };
};

export async function POST(request: Request) {
  // The signature is computed over the exact bytes, so read the raw body first.
  const raw = await request.text();

  const verified = getPaymentProvider().verifyWebhookSignature(raw, {
    "webhook-id": request.headers.get("webhook-id"),
    "webhook-timestamp": request.headers.get("webhook-timestamp"),
    "webhook-signature": request.headers.get("webhook-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: DodoWebhook;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const data = body.data;
  if (!data || data.payload_type !== "Payment") {
    // Subscriptions, refunds, disputes — nothing this route handles yet.
    // Acknowledge so Dodo stops retrying.
    return NextResponse.json({ ok: true, ignored: body.type });
  }

  // We hand this back at checkout-session creation time specifically so this
  // lookup never depends on Dodo echoing an order id back correctly.
  const referenceId = data.metadata?.referenceId;
  if (typeof referenceId !== "string" || !referenceId) {
    return NextResponse.json({ ok: true, ignored: "no referenceId in metadata" });
  }

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, referenceId),
  });
  if (!payment) {
    // Unknown payment. Acknowledge rather than 404 — a retry won't help.
    return NextResponse.json({ ok: true, unknownPayment: referenceId });
  }

  if (body.type === "payment.succeeded") {
    // Idempotent: if a previous retry already settled this, it's a no-op.
    await fulfilPayment({
      paymentId: payment.id,
      providerPaymentId: data.payment_id ?? "",
      method: (data.payment_method_type ?? "upi").toUpperCase(),
    });
    return NextResponse.json({ ok: true, settled: payment.id });
  }

  // Cancelled (the student backed out of Dodo's checkout page) is treated the
  // same as failed — there's no separate PaymentStatus for it, and the
  // outcome for the student is identical: no pass, and the return page's
  // poller should stop waiting instead of spinning for ~60s before giving up.
  if (
    (body.type === "payment.failed" || body.type === "payment.cancelled") &&
    payment.status !== PaymentStatus.PAID
  ) {
    await db
      .update(payments)
      .set({
        status: PaymentStatus.FAILED,
        providerPaymentId: data.payment_id ?? null,
        failureReason:
          data.error_message ??
          (body.type === "payment.cancelled"
            ? "Cancelled at checkout"
            : "Payment failed at gateway"),
      })
      .where(eq(payments.id, payment.id));
    return NextResponse.json({ ok: true, failed: payment.id });
  }

  return NextResponse.json({ ok: true, ignored: body.type });
}

// Trivial marker commit so this branch differs from main and Vercel builds
// a distinct Preview deployment for the Dodo sandbox test. Safe to remove
// once the test is done.
