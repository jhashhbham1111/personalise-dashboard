"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { MailCheck, PencilLine } from "lucide-react";

import {
  changeSignupEmailAction,
  logoutAction,
  resendVerificationAction,
  verifyEmailAction,
} from "../actions";
import { emptyState, type ActionState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

/** How long the resend button stays closed after a code goes out. */
const RESEND_COOLDOWN_SECONDS = 45;

/**
 * The code box, and the only part of this screen that moves.
 *
 * Lives in its own component because `useFormStatus` only reports on a form it
 * is rendered *inside* — reading it from the parent would report nothing.
 */
function CodeField({ state }: { state: ActionState }) {
  const { pending } = useFormStatus();
  const [code, setCode] = useState("");
  const [seenState, setSeenState] = useState(state);
  const [attempt, setAttempt] = useState(0);

  /*
   * A rejected code clears itself and takes focus back.
   *
   * Left in place, the next thing the person types lands on the end of six
   * digits that are already known to be wrong, and `maxLength` silently
   * swallows it — so the box appears frozen at the exact moment they are
   * least inclined to give the benefit of the doubt.
   *
   * Adjusted during render rather than in an effect (the pattern React
   * documents for "reset state when a prop changes"), which avoids the extra
   * commit an effect would cost. `attempt` keys the input, so a rejection
   * remounts it and `autoFocus` puts the cursor back without a ref.
   */
  if (seenState !== state) {
    setSeenState(state);
    if (state.error || state.fields?.code) {
      setCode("");
      setAttempt((a) => a + 1);
    }
  }

  return (
    <>
      <Field
        label="Verification code"
        htmlFor="code"
        hint="6 digits"
        error={state.fields?.code}
      >
        <Input
          key={attempt}
          id="code"
          name="code"
          value={code}
          onChange={(e) => {
            /*
             * Pull six digits out of whatever arrives.
             *
             * People paste the code out of a mail app and bring its
             * surroundings with it — "123 456", a trailing newline, or the
             * whole "Your code is 123456" line.
             *
             * Stripping every non-digit is the obvious move and is wrong: a
             * subject line like "Personalise 2026 — your code is 481920"
             * collapses to "2026481920", whose first six characters are a code
             * nobody was sent. So anything longer than the field itself is
             * treated as a paste and searched for six *consecutive* digits,
             * which is the code and not the year beside it. Plain typing
             * never reaches that branch.
             */
            const raw = e.target.value;
            const run = raw.replace(/\s+/g, "").match(/\d{6}/);
            const next = (
              raw.length > 6 && run ? run[0] : raw.replace(/\D/g, "")
            ).slice(0, 6);
            setCode(next);

            /*
             * Six digits is the whole answer, so there is nothing left to
             * confirm — pressing a button after it would be asking someone to
             * agree that they typed what they just typed. Submitting here also
             * makes the OS autofill suggestion a one-tap finish.
             *
             * The DOM node is written to first because `requestSubmit`
             * serialises the form immediately, before React has re-rendered
             * with the cleaned value — so a pasted "Your code is 123 456" was
             * being sent verbatim and rejected, while the box went on to
             * display the correct six digits it had not submitted.
             */
            if (next.length === 6) {
              e.target.value = next;
              e.target.form?.requestSubmit();
            }
          }}
          disabled={pending}
          inputMode="numeric"
          /* Not type="number": a number input strips leading zeros, and
             "004821" is a perfectly ordinary code. inputMode gets the numeric
             keypad on a phone without that behaviour. */
          autoComplete="one-time-code"
          pattern="[0-9]*"
          /* Deliberately no maxLength: the browser applies it to a paste
             *before* onChange runs, so "Your code is 123456" arrived as
             "Your c" and sanitised to nothing. The slice above is the real
             limit, and it sees the whole pasted string. */
          required
          autoFocus
          placeholder="123456"
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      </Field>

      {/*
       * The screen used to sit perfectly still while someone waited on an
       * email, which reads as broken rather than patient — there is no way to
       * tell a page that is waiting from one that has quietly failed. This
       * line is the difference, and it says which of the two states it is in.
       */}
      <p
        aria-live="polite"
        className="flex items-center justify-center gap-2 text-xs text-ink-soft"
      >
        <span
          className={
            pending
              ? "h-1.5 w-1.5 rounded-full bg-brand-600"
              : "h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400"
          }
        />
        {pending ? "Checking your code…" : "Waiting for your code"}
      </p>
    </>
  );
}

/** Resend, closed for a beat after each send. */
function ResendButton({ secondsLeft }: { secondsLeft: number }) {
  return (
    <SubmitButton
      variant="secondary"
      size="sm"
      pendingText="Sending…"
      disabled={secondsLeft > 0}
    >
      {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : "Send a new code"}
    </SubmitButton>
  );
}

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

  /*
   * Reaching this screen means a code has just been sent, so the countdown
   * starts closed rather than open. Without it the first instinct — the mail
   * has not arrived in four seconds, press the button — spends one of the five
   * sends the server allows in fifteen minutes, and a few of those in a row
   * turn a slow inbox into a lockout.
   */
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // Each resend restarts it. `resendState` is a fresh object per submission,
  // so comparing identity fires this once per send rather than once per
  // render — again adjusted during render rather than from an effect.
  const [seenResend, setSeenResend] = useState(resendState);
  if (seenResend !== resendState) {
    setSeenResend(resendState);
    if (resendState.success) setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }

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
        <CodeField state={state} />

        {/*
         * Still here, and still real, for the case auto-submit cannot cover:
         * a browser that fills the field without firing an input event, and
         * anyone who navigates by keyboard and expects a form to have a way
         * to send it.
         */}
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
          <ResendButton secondsLeft={secondsLeft} />
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
