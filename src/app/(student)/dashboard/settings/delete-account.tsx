"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";

import { deleteAccountAction } from "./actions";
import { emptyState } from "@/lib/actions";
import { LEGAL } from "@/lib/legal";
import { pluralize } from "@/lib/utils";
import { Fill } from "@/components/legal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * In-app account deletion — the path Google Play requires an app to offer, and
 * the one /account/delete points people at.
 *
 * What's kept and what goes is spelled out on the page itself rather than only
 * inside the dialog, because this is the decision people want to read about
 * before they touch anything. The dialog then asks for the email address to be
 * typed out: there is no undo behind this button, and a plain "Are you sure?"
 * is one mis-tap away from being answered by accident.
 */
export function DeleteAccount({
  email,
  upcomingBookings,
  blockedReason,
}: {
  email: string;
  upcomingBookings: number;
  /** Set when this account can't be deleted yet — an instructor with students mid-term. */
  blockedReason: string | null;
}) {
  const [state, action] = useActionState(deleteAccountAction, emptyState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <Card className="border-danger-500/30 p-5">
      <h2 className="text-base font-semibold text-ink">Delete my account</h2>
      <p className="mt-1 text-sm text-ink-soft">
        This can&apos;t be undone. Read what happens before you start.
      </p>

      {/* Stacked rather than two columns: the settings page is a narrow
          single-column layout, and half of it is too little room for a list
          nobody should skim. */}
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Removed straight away
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            <li>Your name, replaced with &ldquo;Deleted account&rdquo;</li>
            <li>Your email address and phone number</li>
            <li>Your profile photo</li>
            <li>Your password — you can never sign in again</li>
            {upcomingBookings > 0 ? (
              <li>
                {pluralize(upcomingBookings, "upcoming booking")}, cancelled so the
                seat goes to someone else
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Kept, without your name on it
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            <li>Payment and invoice records, which we&apos;re required to keep for tax</li>
            <li>Attendance on classes you&apos;ve already taken</li>
            <li>Your instructors&apos; earnings figures, so their books still balance</li>
          </ul>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        Questions first? Write to{" "}
        <Fill value={LEGAL.supportEmail} label="Support email" />. The same
        details are on{" "}
        <Link
          href="/account/delete"
          className="font-medium text-brand-600 hover:underline"
        >
          our deletion page
        </Link>
        , which you can read without signing in.
      </p>

      {blockedReason ? (
        <Alert tone="warning" className="mt-4">
          {blockedReason}
        </Alert>
      ) : (
        <div className="mt-4 flex flex-col items-start gap-2">
          <Modal
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            }
            title="Delete this account?"
            description="Your name, email, phone and photo are erased and you're signed out for good. Payment records stay, with nothing on them that identifies you."
          >
            <form action={action} className="space-y-4">
              <FormMessage state={state} />

              <Field
                label="Type your email address to confirm"
                htmlFor="confirmEmail"
                hint={email}
                error={state.fields?.confirmEmail}
              >
                <Input
                  id="confirmEmail"
                  name="confirmEmail"
                  type="email"
                  autoComplete="off"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={email}
                  required
                />
              </Field>

              <div className="flex justify-end gap-2">
                <ModalClose asChild>
                  <Button variant="secondary">Keep my account</Button>
                </ModalClose>
                <SubmitButton
                  variant="danger"
                  disabled={!matches}
                  pendingText="Deleting…"
                >
                  Delete permanently
                </SubmitButton>
              </div>
            </form>
          </Modal>

          {/* The dialog unmounts on a failed submit only if it's closed, so a
              refusal from the server (an instructor who acquired a student
              between page load and clicking) is repeated out here where it
              can't be missed. */}
          {state.error ? <FormMessage state={state} /> : null}
        </div>
      )}
    </Card>
  );
}
