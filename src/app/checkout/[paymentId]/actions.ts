"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, payments } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { fulfilPayment } from "@/lib/checkout";
import { env } from "@/lib/env";
import { getPaymentProvider } from "@/lib/payments";
import { mockPaymentId, mockSignPayment } from "@/lib/payments/mock";
import { fail, str, type ActionState } from "@/lib/actions";
import { PaymentStatus } from "@/lib/enums";

/**
 * Completes the development checkout.
 *
 * It goes through the same signature verification the live provider uses — the
 * mock provider signs with the same HMAC-SHA256 scheme — so this code path is
 * not a shortcut around the real one, just a different secret.
 */
export async function completeMockPaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  // This action mints and verifies its own signature, so without this gate a
  // deployment with online payments off would still hand out real passes to
  // anyone who POSTs to it.
  if (!env.onlinePayments) return fail("Online payment isn't available.");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const paymentId = str(form, "paymentId");
  const method = str(form, "method") || "UPI";
  const outcome = str(form, "outcome"); // "success" | "failure"

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment || payment.studentId !== user.id) {
    return fail("We couldn't find that payment.");
  }

  if (outcome === "failure") {
    await db
      .update(payments)
      .set({
        status: PaymentStatus.FAILED,
        failureReason: "Payment declined at the simulated gateway.",
      })
      .where(eq(payments.id, payment.id));
    return fail("Payment failed. No money was taken — you can try again.");
  }

  const providerPaymentId = mockPaymentId();
  const signature = mockSignPayment(payment.providerOrderId ?? "", providerPaymentId);

  const valid = await getPaymentProvider().verifyCheckoutSignature({
    orderId: payment.providerOrderId ?? "",
    paymentId: providerPaymentId,
    signature,
  });
  if (!valid) return fail("Payment could not be verified.");

  const result = await fulfilPayment({
    paymentId: payment.id,
    providerPaymentId,
    method,
  });
  if (!result.ok) return fail(result.error);

  redirect("/dashboard?paid=1");
}

/** Verifies the Razorpay Checkout browser callback and grants access. */
export async function confirmRazorpayAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!env.onlinePayments) return fail("Online payment isn't available.");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const paymentId = str(form, "paymentId");
  const razorpayPaymentId = str(form, "razorpayPaymentId");
  const razorpayOrderId = str(form, "razorpayOrderId");
  const signature = str(form, "signature");
  const method = str(form, "method") || "UPI";

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment || payment.studentId !== user.id) {
    return fail("We couldn't find that payment.");
  }

  const valid = await getPaymentProvider().verifyCheckoutSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature,
  });
  if (!valid) {
    // Not fatal — the webhook is the authority and will settle this shortly.
    return fail(
      "We couldn't verify that payment yet. If money left your account, it'll be confirmed within a minute.",
    );
  }

  const result = await fulfilPayment({
    paymentId: payment.id,
    providerPaymentId: razorpayPaymentId,
    method,
  });
  if (!result.ok) return fail(result.error);

  redirect("/dashboard?paid=1");
}
