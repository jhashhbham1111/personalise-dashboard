"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";

import { confirmRazorpayAction } from "./actions";
import { emptyState } from "@/lib/actions";
import { formatMoney } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

/**
 * Razorpay Checkout, opened UPI-first.
 *
 * `config.display.blocks` promotes UPI to the top of the method list and marks
 * it preferred, which is what most students in India will reach for. Cards and
 * netbanking stay available below.
 *
 * The success handler posts the signed handoff to a server action for
 * verification — but the webhook remains the authority, so a student who closes
 * this window mid-payment still gets access.
 */

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function RazorpayCheckout({
  paymentId,
  orderId,
  amountPaise,
  currency,
  description,
  keyId,
  customer,
}: {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  keyId: string;
  customer: { name: string; email: string };
}) {
  const [state, action] = useActionState(confirmRazorpayAction, emptyState);
  const [ready, setReady] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Held in state, not a ref: the hidden inputs must be rendered with these
  // values *before* the form is submitted, which requires a re-render.
  const [handoff, setHandoff] = useState({
    razorpayPaymentId: "",
    razorpayOrderId: "",
    signature: "",
    method: "UPI",
  });

  // Submit once the handoff values have actually landed in the DOM.
  useEffect(() => {
    if (handoff.razorpayPaymentId) formRef.current?.requestSubmit();
  }, [handoff]);

  function openCheckout() {
    if (!window.Razorpay) return;

    const rzp = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount: amountPaise,
      currency,
      name: "Personalise",
      description,
      prefill: { name: customer.name, email: customer.email },
      theme: { color: "#1f6650" },
      config: {
        display: {
          blocks: {
            upi: {
              name: "Pay by UPI",
              instruments: [{ method: "upi" }],
            },
          },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true },
        },
      },
      handler: (response: RazorpayResponse) => {
        setHandoff({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
          method: "UPI",
        });
      },
    });

    rzp.open();
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setReady(true)}
        strategy="afterInteractive"
      />

      <form ref={formRef} action={action}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <input
          type="hidden"
          name="razorpayPaymentId"
          value={handoff.razorpayPaymentId}
        />
        <input
          type="hidden"
          name="razorpayOrderId"
          value={handoff.razorpayOrderId}
        />
        <input type="hidden" name="signature" value={handoff.signature} />
        <input type="hidden" name="method" value={handoff.method} />
      </form>

      {state.error ? <Alert tone="warning">{state.error}</Alert> : null}

      <Button
        block
        size="lg"
        className="mt-4"
        disabled={!ready}
        onClick={openCheckout}
      >
        {ready ? `Pay ${formatMoney(amountPaise, currency)}` : "Loading checkout…"}
      </Button>

      <p className="mt-3 text-center text-xs text-ink-faint">
        UPI, cards, netbanking and wallets. Powered by Razorpay.
      </p>
    </>
  );
}
