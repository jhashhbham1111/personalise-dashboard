"use client";

import { useActionState, useState } from "react";
import { Copy, Check, Plus } from "lucide-react";

import { generatePassCodesAction, revokePassCodeAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { formatPassCode } from "@/lib/pass-codes-format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type PlanOption = { id: string; label: string };

export function GenerateCodesDialog({ plans }: { plans: PlanOption[] }) {
  const [state, action] = useActionState(generatePassCodesAction, emptyState);
  const [open, setOpen] = useState(false);

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
          <Field label="How many?" htmlFor="quantity" hint="up to 100">
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

        <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
          Each code works once. The pass terms are fixed when the code is made,
          so editing the plan later won&rsquo;t change what an issued code is
          worth.
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
