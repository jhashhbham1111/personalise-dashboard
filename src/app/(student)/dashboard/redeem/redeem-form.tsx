"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";

import { previewPassCodeAction, redeemPassCodeAction } from "../../../(marketing)/actions";
import { emptyState } from "@/lib/actions";
import {
  formatPassCode,
  normalisePassCode,
  PASS_CODE_LENGTH,
} from "@/lib/pass-codes-format";
import { formatMoney, pluralize } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

type Preview = {
  code: string;
  label: string;
  amountPaise: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  instructorName: string;
  offeringTitle: string;
};

/**
 * Redeem a pass code.
 *
 * The code is checked before it's spent so a student sees exactly what they're
 * activating — and a mistyped code fails while it's still fixable, rather than
 * after it has been consumed.
 */
export function RedeemForm({ initialCode }: { initialCode?: string }) {
  const [state, action] = useActionState(redeemPassCodeAction, emptyState);
  const [raw, setRaw] = useState(initialCode ?? "");
  // The looked-up result carries the code it describes, so a response that
  // arrives after the student has kept typing is ignored by comparison rather
  // than cleared from inside the effect.
  const [lookup, setLookup] = useState<{
    code: string;
    preview?: Preview;
    error?: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  const normalised = normalisePassCode(raw);
  const complete = normalised.length === PASS_CODE_LENGTH;

  const current = lookup?.code === normalised ? lookup : null;
  const preview = current?.preview ?? null;
  const lookupError = current?.error ?? null;

  useEffect(() => {
    if (!complete) return;
    startTransition(async () => {
      const result = await previewPassCodeAction(normalised);
      setLookup(
        result.ok
          ? { code: normalised, preview: result.preview }
          : { code: normalised, error: result.error },
      );
    });
  }, [normalised, complete]);

  if (state.success) {
    return (
      <Card className="p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Ticket className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-ink">Your pass is active</h2>
        <p className="mt-1 text-sm text-ink-soft">{state.success}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/classes">Find a class to book</ButtonLink>
          <ButtonLink href="/dashboard/passes" variant="secondary">
            See my passes
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="code" value={normalised} />

        <FormMessage state={state} />

        <Field
          label="Your pass code"
          htmlFor="code-input"
          hint="Eight characters, from your instructor"
        >
          <Input
            id="code-input"
            value={formatPassCode(raw)}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="ABCD-2345"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono text-lg tracking-[0.2em]"
            required
          />
        </Field>

        {lookupError ? <Alert tone="danger">{lookupError}</Alert> : null}

        {preview ? (
          <div className="rounded-lg border border-brand-300 bg-brand-50 p-4">
            <p className="text-sm font-medium text-ink">{preview.label}</p>
            <dl className="mt-2 space-y-1 text-sm text-ink-soft">
              <div className="flex justify-between gap-3">
                <dt>Instructor</dt>
                <dd className="text-ink">{preview.instructorName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Classes</dt>
                <dd className="text-ink">
                  {preview.sessionsIncluded === null
                    ? "Unlimited"
                    : pluralize(preview.sessionsIncluded, "class", "classes")}
                </dd>
              </div>
              {preview.validityDays ? (
                <div className="flex justify-between gap-3">
                  <dt>Valid for</dt>
                  <dd className="text-ink">{preview.validityDays} days</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt>Value</dt>
                <dd className="text-ink">{formatMoney(preview.amountPaise)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <SubmitButton block size="lg" pendingText="Activating…" disabled={!preview}>
          {preview ? "Activate this pass" : "Enter your code"}
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-xs text-ink-faint">
        Don&rsquo;t have a code?{" "}
        <Link href="/instructors" className="underline hover:text-brand-700">
          Find an instructor
        </Link>{" "}
        and pay them directly — they&rsquo;ll give you one.
      </p>
    </Card>
  );
}
