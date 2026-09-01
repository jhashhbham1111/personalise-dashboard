"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link as LinkIcon, Plus, Printer } from "lucide-react";

import {
  generatePassCodesAction,
  revokePassCodeAction,
  type GenerateCodesState,
} from "../actions";
import { emptyState } from "@/lib/actions";
import { formatPassCode } from "@/lib/pass-codes-format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type PlanOption = { id: string; label: string };

/** A ready-to-send link that fills the code in for the student. */
function redeemLink(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/dashboard/redeem?code=${encodeURIComponent(code)}`;
}

export function GenerateCodesDialog({ plans }: { plans: PlanOption[] }) {
  const [state, action] = useActionState<GenerateCodesState, FormData>(
    generatePassCodesAction,
    emptyState,
  );
  const [open, setOpen] = useState(false);

  const created = state.codes ?? [];

  /*
   * Once codes exist, the form has done its job — showing it again invites a
   * second accidental batch, and the codes are the thing that needs the space.
   */
  if (created.length > 0) {
    return (
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Closing discards the result view; the codes remain in the table
          // below, and re-opening should offer a fresh form rather than the
          // last batch.
          if (!next) window.location.reload();
        }}
        trigger={
          <Button>
            <Plus className="h-4 w-4" />
            Create codes
          </Button>
        }
        title={`${created.length} code${created.length === 1 ? "" : "s"} ready`}
        description="Copy them somewhere safe now — they're listed in the table below too, and you can come back to them any time."
      >
        <div className="space-y-4">
          <CodeList codes={created} />

          <div className="flex flex-wrap gap-2">
            <CopyAllButton codes={created} />
            {/* New tab: the print sheet is a page to send to a printer, not a
                place to navigate away to mid-batch. */}
            <ButtonLink
              href="/studio/codes/print"
              target="_blank"
              rel="noreferrer"
              variant="secondary"
            >
              <Printer className="h-4 w-4" />
              Print sheet
            </ButtonLink>
          </div>

          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            Each code works once. Send a student the code itself, or the link
            beside it — the link opens the redeem page with the code already
            filled in.
          </p>

          <div className="flex justify-end">
            <ModalClose asChild>
              <Button>Done</Button>
            </ModalClose>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          Create codes
        </Button>
      }
      title="Create pass codes"
      description="Hand one to each student when they pay you. They redeem it themselves and their pass activates — you don't have to do anything else."
    >
      <form action={action} className="space-y-4">
        <FormMessage state={state} />

        <Field label="Which pass?" htmlFor="planId">
          <Select id="planId" name="planId" required>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How many codes?" htmlFor="quantity" hint="up to 100">
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              max={100}
              defaultValue={10}
              required
            />
          </Field>

          <Field
            label="Codes expire in"
            htmlFor="expiresInDays"
            hint="days, blank = never"
          >
            <Input
              id="expiresInDays"
              name="expiresInDays"
              type="number"
              min={1}
              max={730}
              placeholder="90"
            />
          </Field>
        </div>

        <Field label="Note" htmlFor="note" hint="optional, only you see it">
          <Input id="note" name="note" placeholder="Printed for the January batch" />
        </Field>

        {/* Says what the rule protects, not what the rule is. The previous
            wording ("the pass terms are fixed when the code is made") was
            accurate and meant nothing to the person reading it — the point is
            that a student holding a printed code always gets what they paid
            for, even after the plan changes. */}
        <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
          Each code can be used once. A code keeps the price and classes it has
          today — so if you change this pass later, codes you have already
          handed out still give students exactly what they paid for.
        </p>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Creating…">Create codes</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

/** The freshly-created codes, each with its own copy and share-link buttons. */
function CodeList({ codes }: { codes: string[] }) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line bg-paper p-2">
      {codes.map((code) => (
        <div
          key={code}
          className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5"
        >
          <code className="flex-1 font-mono text-sm tracking-wide text-ink">
            {formatPassCode(code)}
          </code>
          <CopyCodeButton code={code} />
          <CopyValueButton
            value={redeemLink(code)}
            label={`Copy redeem link for ${formatPassCode(code)}`}
            icon={<LinkIcon className="h-4 w-4" />}
          />
        </div>
      ))}
    </div>
  );
}

function CopyAllButton({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          // One per line: pastes cleanly into WhatsApp, a spreadsheet or a doc.
          await navigator.clipboard.writeText(
            codes.map((c) => formatPassCode(c)).join("\n"),
          );
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* Clipboard blocked — the codes are listed above to copy by hand. */
        }
      }}
    >
      {copied ? (
        <Check className="h-4 w-4 text-brand-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Copied" : `Copy all ${codes.length}`}
    </Button>
  );
}

function CopyValueButton({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* Clipboard blocked. */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-brand-600" /> : icon}
    </Button>
  );
}

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={`Copy ${formatPassCode(code)}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(formatPassCode(code));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* Clipboard blocked — the code is on screen to read anyway. */
        }
      }}
    >
      {copied ? (
        <Check className="h-4 w-4 text-brand-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}

export function RevokeCodeButton({
  codeId,
  code,
}: {
  codeId: string;
  code: string;
}) {
  const [state, action] = useActionState(revokePassCodeAction, emptyState);
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="ghost">
          Revoke
        </Button>
      }
      title={`Revoke ${formatPassCode(code)}?`}
      description="It stops working immediately. Use this if a code was lost, printed by mistake, or handed to the wrong person."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="codeId" value={codeId} />
        <FormMessage state={state} />
        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Revoking…">
            Revoke code
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
