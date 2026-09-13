import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db, payments } from "@/db";
import { fulfilPayment } from "@/lib/checkout";
import { getPaymentProvider } from "@/lib/payments";
import { PaymentStatus } from "@/lib/enums";

/**
 * Razorpay webhook — the authority on payment status.
 *
 * The browser callback after checkout is only a fast path; a student who closes
 * the tab mid-payment still gets their pass because this fires regardless.
 *
 * Register at https://dashboard.razorpay.com → Settings → Webhooks with the
 * events `payment.captured` and `payment.failed`, and put the signing secret in
 * RAZORPAY_WEBHOOK_SECRET.
 */

type RazorpayWebhook = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        method?: string;
        error_description?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  // The signature is computed over the exact bytes, so read the raw body first.
  const raw = await request.text();

  if (
    !getPaymentProvider().verifyWebhookSignature(raw, {
      "x-razorpay-signature": request.headers.get("x-razorpay-signature"),
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: RazorpayWebhook;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const entity = body.payload?.payment?.entity;
  const orderId = entity?.order_id;
  if (!orderId) {
    // Not a payment event we care about — acknowledge so Razorpay stops retrying.
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  const payment = await db.query.payments.findFirst({
    where: eq(payments.providerOrderId, orderId),
  });
  if (!payment) {
    // Unknown order. Acknowledge rather than 404 — a retry won't help.
    return NextResponse.json({ ok: true, unknownOrder: orderId });
  }

  if (body.event === "payment.captured") {
    // Idempotent: if the browser callback already settled this, it's a no-op.
    await fulfilPayment({
      paymentId: payment.id,
      providerPaymentId: entity.id ?? "",
      method: (entity.method ?? "upi").toUpperCase(),
    });
    return NextResponse.json({ ok: true, settled: payment.id });
  }

  if (body.event === "payment.failed" && payment.status !== PaymentStatus.PAID) {
    await db
      .update(payments)
      .set({
        status: PaymentStatus.FAILED,
        providerPaymentId: entity.id ?? null,
        failureReason: entity.error_description ?? "Payment failed at gateway",
      })
      .where(eq(payments.id, payment.id));
    return NextResponse.json({ ok: true, failed: payment.id });
  }

  return NextResponse.json({ ok: true, ignored: body.event });
}
