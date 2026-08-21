"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { requestPasswordResetAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, emptyState);

  // The success message is identical whether or not the address is registered,
  // so this screen never reveals which emails have accounts.
  if (state.success) {
    return (
      <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-5 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-700">
          <MailCheck className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm text-ink">{state.success}</p>
        <p className="mt-2 text-xs text-ink-faint">
          Check your spam folder if it hasn&rsquo;t arrived in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label="Email" htmlFor="email" error={state.fields?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <SubmitButton block size="lg" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
