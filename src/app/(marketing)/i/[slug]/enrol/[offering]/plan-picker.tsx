"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { enrolAction } from "../../../../actions";
import { emptyState } from "@/lib/actions";
import { PLAN_KIND_LABEL } from "@/lib/enums";
import { cn, formatMoney, pluralize } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";

type Plan = {
  id: string;
  name: string;
  kind: string;
  amountPaise: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  description: string | null;
};

/** Per-class price, so packs can be compared honestly against a drop-in. */
function perClass(plan: Plan): string | null {
  if (!plan.sessionsIncluded || plan.sessionsIncluded < 2) return null;
  return `${formatMoney(Math.round(plan.amountPaise / plan.sessionsIncluded))} a class`;
}

export function PlanPicker({
  plans,
  isSignedIn,
  returnTo,
  onlinePayments,
  instructorName,
}: {
  plans: Plan[];
  isSignedIn: boolean;
  returnTo: string;
  /** When false, students pay the instructor directly and there's no checkout. */
  onlinePayments: boolean;
  instructorName: string;
}) {
  const [state, action] = useActionState(enrolAction, emptyState);
  // Default to the best-value plan rather than the cheapest — it's the one most
  // people actually want, and it makes the comparison obvious.
  const [selected, setSelected] = useState(
    plans.reduce((best, p) =>
      (p.sessionsIncluded ?? 0) > (best.sessionsIncluded ?? 0) ? p : best,
    ).id,
  );

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink">Choose a pass</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Cancel any single booking up to 4 hours before it starts.
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="planId" value={selected} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div role="radiogroup" aria-label="Passes" className="space-y-2">
          {plans.map((plan) => {
            const on = selected === plan.id;
            const unit = perClass(plan);
            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(plan.id)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
                  on
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                    : "border-line-strong bg-surface hover:border-brand-300",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {plan.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {plan.sessionsIncluded === null
                      ? `${PLAN_KIND_LABEL[plan.kind]} · unlimited classes`
                      : pluralize(plan.sessionsIncluded, "class", "classes")}
                    {plan.validityDays ? ` · valid ${plan.validityDays} days` : ""}
                  </span>
                  {plan.description ? (
                    <span className="mt-1 block text-xs text-ink-faint">
                      {plan.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums text-ink">
                    {formatMoney(plan.amountPaise)}
                  </span>
                  {unit ? (
                    <span className="mt-0.5 block text-[11px] text-ink-faint">
                      {unit}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {state.error ? (
          <Alert tone="danger" className="mt-3">
            {state.error}
          </Alert>
        ) : null}

        {!onlinePayments ? (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-medium text-ink">
              How to join this class
            </p>
            <ol className="mt-2 space-y-1.5 text-sm text-ink-soft">
              <li>
                1. {isSignedIn ? "You already have an account." : "Create your free account."}
              </li>
              <li>2. Pay {instructorName} directly — cash, UPI or bank transfer.</li>
              <li>
                3. They&rsquo;ll activate your pass here, and you can start
                booking classes straight away.
              </li>
            </ol>
            {!isSignedIn ? (
              <ButtonLink
                href={`/login?next=${encodeURIComponent(returnTo)}`}
                size="lg"
                block
                className="mt-3"
              >
                Create an account
              </ButtonLink>
            ) : null}
          </div>
        ) : isSignedIn ? (
          <>
            <SubmitButton block size="lg" className="mt-4" pendingText="Opening checkout…">
              Continue to payment
            </SubmitButton>
            <p className="mt-3 text-center text-xs text-ink-faint">
              Pay by UPI, card or netbanking. Secure checkout.
            </p>
          </>
        ) : (
          <ButtonLink
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            size="lg"
            block
            className="mt-4"
          >
            Sign in to enrol
          </ButtonLink>
        )}

        {/* A pass code is a real, self-service alternative to every path
            above — not just for the offline-payment case, since redeeming
            one works the same way regardless of whether online checkout is
            on. This is the page a student actually lands on to enrol, so if
            the hint isn't here, a code they were handed effectively doesn't
            exist for them. */}
        <p className="mt-3 text-center text-xs text-ink-faint">
          Already got a pass code from {instructorName}?{" "}
          <Link
            href={
              isSignedIn
                ? "/dashboard/redeem"
                : `/login?next=${encodeURIComponent("/dashboard/redeem")}`
            }
            className="font-medium text-brand-700 hover:underline"
          >
            Redeem it
          </Link>
        </p>
      </form>
    </Card>
  );
}
