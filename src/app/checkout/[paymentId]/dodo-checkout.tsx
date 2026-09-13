"use client";

import { ShieldCheck } from "lucide-react";

import { formatMoney } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

/**
 * Dodo Payments checkout.
 *
 * Unlike Razorpay there's no in-page modal here — the order was already
 * created server-side in `startCheckout`, which is what produced this exact
 * `checkoutUrl`. All this does is hand the browser off to it. Dodo redirects
 * back to `/checkout/[paymentId]/return` once the customer is done, but that
 * page never fulfils anything itself — only the webhook does (see
 * src/lib/payments/provider.ts for why).
 */
export function DodoCheckout({
  amountPaise,
  currency,
  checkoutUrl,
}: {
  amountPaise: number;
  currency: string;
  checkoutUrl: string | null;
}) {
  if (!checkoutUrl) {
    return (
      <Alert tone="warning">
        We couldn&rsquo;t start this checkout. Refresh the page to try again —
        if it keeps happening, contact support rather than paying twice.
      </Alert>
    );
  }

  return (
    <>
      <Button block size="lg" onClick={() => window.location.assign(checkoutUrl)}>
        Pay {formatMoney(amountPaise, currency)}
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
        You&rsquo;ll be taken to Dodo Payments&rsquo; secure checkout, then
        brought back here.
      </p>
    </>
  );
}
