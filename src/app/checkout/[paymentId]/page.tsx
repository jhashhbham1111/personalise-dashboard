import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";

import { db, payments } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { MockCheckout } from "./mock-checkout";
import { RazorpayCheckout } from "./razorpay-checkout";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  // No checkout exists while students pay their instructor directly. Any
  // payment row from before the switch is unreachable rather than half-usable.
  if (!env.onlinePayments) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment) notFound();
  // A payment page is a private document — only the payer may open it.
  if (payment.studentId !== user.id) notFound();

  if (payment.status === "PAID") redirect("/dashboard?paid=1");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
            <ShieldCheck className="h-4 w-4 text-brand-500" />
            Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                You&rsquo;re paying for
              </p>
              <h1 className="mt-1 font-semibold text-ink">{payment.description}</h1>
              <p className="mt-1 text-xs text-ink-faint">
                Invoice {payment.invoiceNo}
              </p>
            </div>
            <p className="shrink-0 text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(payment.amountPaise, payment.currency)}
            </p>
          </div>

          <div className="pt-5">
            {env.paymentProvider === "razorpay" ? (
              <RazorpayCheckout
                paymentId={payment.id}
                orderId={payment.providerOrderId ?? ""}
                amountPaise={payment.amountPaise}
                currency={payment.currency}
                description={payment.description}
                keyId={env.razorpay.keyId ?? ""}
                customer={{ name: user.name, email: user.email }}
              />
            ) : (
              <MockCheckout
                paymentId={payment.id}
                amountPaise={payment.amountPaise}
              />
            )}
          </div>
        </Card>

        <p className="mt-4 text-center text-xs text-ink-faint">
          By paying you agree to the instructor&rsquo;s cancellation policy —
          free cancellation up to 4 hours before any class.
        </p>
      </main>
    </div>
  );
}
