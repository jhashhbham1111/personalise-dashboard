"use client";

import { useActionState, useState } from "react";
import { Building2, CreditCard, Smartphone, Wallet } from "lucide-react";

import { completeMockPaymentAction } from "./actions";
import { emptyState } from "@/lib/actions";
import { cn, formatMoney } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Development checkout.
 *
 * Laid out UPI-first on purpose — it mirrors what students will see when
 * PAYMENT_PROVIDER=razorpay, so the flow you test locally is the flow they get.
 * The "simulate failure" control exists because the failure path is the one
 * that's usually broken in demos.
 */

const METHODS = [
  { value: "UPI", label: "UPI", hint: "GPay, PhonePe, Paytm", icon: Smartphone },
  { value: "CARD", label: "Card", hint: "Credit or debit", icon: CreditCard },
  { value: "NETBANKING", label: "Netbanking", hint: "All major banks", icon: Building2 },
  { value: "WALLET", label: "Wallet", hint: "Amazon Pay, Mobikwik", icon: Wallet },
] as const;

export function MockCheckout({
  paymentId,
  amountPaise,
}: {
  paymentId: string;
  amountPaise: number;
}) {
  const [state, action] = useActionState(completeMockPaymentAction, emptyState);
  const [method, setMethod] = useState<string>("UPI");

  return (
    <form action={action}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="method" value={method} />

      <p className="text-sm font-medium text-ink">Pay using</p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {METHODS.map((m) => {
          const Icon = m.icon;
          const on = method === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                on
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                  : "border-line-strong bg-surface hover:border-brand-300",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  on ? "text-brand-600" : "text-ink-faint",
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{m.label}</span>
                <span className="block text-xs text-ink-faint">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {method === "UPI" ? (
        <div className="mt-4 rounded-lg border border-line bg-paper p-4">
          <label
            htmlFor="vpa"
            className="block text-sm font-medium text-ink"
          >
            UPI ID
          </label>
          <Input
            id="vpa"
            name="vpa"
            placeholder="yourname@okhdfcbank"
            defaultValue="demo@upi"
            className="mt-1.5 bg-surface"
          />
          <p className="mt-2 text-xs text-ink-faint">
            You&rsquo;d normally approve this in your UPI app. In this demo,
            pressing Pay approves it for you.
          </p>
        </div>
      ) : null}

      {state.error ? (
        <Alert tone="danger" className="mt-4">
          {state.error}
        </Alert>
      ) : null}

      <SubmitButton
        block
        size="lg"
        className="mt-5"
        name="outcome"
        value="success"
        pendingText="Confirming payment…"
      >
        Pay {formatMoney(amountPaise)}
      </SubmitButton>

      <SubmitButton
        block
        size="sm"
        variant="ghost"
        className="mt-2"
        name="outcome"
        value="failure"
        pendingText="Simulating…"
      >
        Simulate a failed payment
      </SubmitButton>

      <p className="mt-4 rounded-lg bg-accent-100 px-3 py-2 text-xs text-accent-700">
        Demo mode — no real money moves. Set{" "}
        <code className="font-mono">PAYMENT_PROVIDER=razorpay</code> in .env to
        take live UPI payments.
      </p>
    </form>
  );
}
