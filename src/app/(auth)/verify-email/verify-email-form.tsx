"use client";

import { useActionState, useState } from "react";
import { MailCheck, PencilLine } from "lucide-react";

import {
  changeSignupEmailAction,
  logoutAction,
  resendVerificationAction,
  verifyEmailAction,
} from "../actions";
import { emptyState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyEmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(verifyEmailAction, emptyState);
  const [resendState, resendAction] = useActionState(
    resendVerificationAction,
    emptyState,
  );
  const [changeState, changeAction] = useActionState(
    changeSignupEmailAction,
    emptyState,
  );
  const [editingEmail, setEditingEmail] = useState(false);

  return (
    <div className="mt-6 space-y-5">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {resendState.success ? (
        <Alert tone="success">{resendState.success}</Alert>
      ) : null}
      {resendState.error ? <Alert tone="warning">{resendState.error}</Alert> : null}
      {changeState.success ? (
        <Alert tone="success">{changeState.success}</Alert>
      ) : null}

      {/*
       * Its own <form>, so the code is the only thing that submits when
       * someone hits enter in the box — the resend and change-address forms
       * below are siblings rather than nested, which HTML doesn't allow and
       * React silently mangles.
       */}
      <form action={action} className="space-y-4">
        <Field
          label="Verification code"
          htmlFor="code"
          hint="6 digits"
          error={state.fields?.code}
        >
          <Input
            id="code"
            name="code"
            /* Not type="number": a number input strips leading zeros, and
               "004821" is a perfectly ordinary code. inputMode gets the
               numeric keypad on a phone without that behaviour. */
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </Field>

        <SubmitButton block size="lg" pendingText="Checking…">
          Confirm email
        </SubmitButton>
      </form>

      <div className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm">
        <p className="flex items-start gap-2 text-ink-soft">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <span>
            Nothing in your inbox? It can take a minute — check spam too.
          </span>
        </p>

        <form action={resendAction} className="mt-3">
          <SubmitButton variant="secondary" size="sm" pendingText="Sending…">
            Send a new code
          </SubmitButton>
        </form>
      </div>

      {/*
       * The escape hatch for a typo. Without it, one wrong character at signup
       * is an account nobody can reach: the code goes to an address its owner
       * can't read, and password reset would mail the same wrong address.
       */}
      {editingEmail ? (
        <form action={changeAction} className="space-y-3 rounded-lg border border-line-strong p-4">
          {changeState.error ? (
            <Alert tone="danger">{changeState.error}</Alert>
          ) : null}
          <Field
            label="Correct email address"
            htmlFor="new-email"
            error={changeState.fields?.email}
          >
            <Input
              id="new-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={email}
            />
          </Field>
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingText="Saving…">
              Use this address
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditingEmail(false)}
              className="text-sm text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditingEmail(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <PencilLine className="h-3.5 w-3.5" />
          Wrong address? Change it
        </button>
      )}

      {/* Someone who signed up on a shared device needs a way off this screen
          that isn't "finish verifying an account you didn't mean to make". */}
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-sm text-ink-faint transition-colors hover:text-ink-soft"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
