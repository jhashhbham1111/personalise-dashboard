import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db, payments } from "@/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { StatusPoller } from "./status-poller";

export const metadata: Metadata = { title: "Confirming payment" };

/**
 * Where Dodo redirects the browser back to after its hosted checkout.
 *
 * This page never fulfils a payment itself — see provider.ts for why a
 * redirect-based gateway has no browser-signed step worth trusting. It only
 * ever shows what our own database already believes, polling until the
 * webhook (the sole source of truth) updates it.
 */
export default async function CheckoutReturnPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  if (!env.onlinePayments) notFound();

  const user = await requireUser(`/checkout/${paymentId}/return`);

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment) notFound();
  if (payment.studentId !== user.id) notFound();

  if (payment.status === "PAID") redirect("/dashboard?paid=1");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Card className="p-6">
          <div className="border-b border-line pb-5">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {payment.description}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(payment.amountPaise, payment.currency)}
            </p>
          </div>

          <div className="pt-2">
            <StatusPoller paymentId={payment.id} />
          </div>
        </Card>
      </main>
    </div>
  );
}
