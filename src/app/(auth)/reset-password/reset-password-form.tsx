"use client";

import { useActionState } from "react";

import { completePasswordResetAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(completePasswordResetAction, emptyState);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label="New password"
        htmlFor="password"
        hint="8 characters or more"
        error={state.fields?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirm"
        error={state.fields?.confirm}
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <SubmitButton block size="lg" pendingText="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
