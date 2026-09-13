"use server";

import { eq } from "drizzle-orm";

import { db, payments } from "@/db";
import { requireUser } from "@/lib/auth";

/**
 * Polled by the return page while a Dodo payment is still settling.
 *
 * Read-only, deliberately — this never fulfils anything itself. Only the
 * webhook (src/app/api/payments/dodo/webhook/route.ts) is allowed to do that.
 * This just answers "has it landed yet" so the page can stop spinning.
 */
export async function getPaymentStatusAction(
  paymentId: string,
): Promise<{ status: string } | { status: "not-found" }> {
  const user = await requireUser(`/checkout/${paymentId}/return`);

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
    columns: { studentId: true, status: true },
  });
  if (!payment || payment.studentId !== user.id) return { status: "not-found" };

  return { status: payment.status };
}
