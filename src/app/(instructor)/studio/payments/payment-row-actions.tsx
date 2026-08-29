"use client";

import { useActionState, useState } from "react";
import { Pencil, Undo2 } from "lucide-react";

import { updatePaymentAction, voidPaymentAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type Row = {
  id: string;
  invoiceNo: string;
  description: string;
  amountRupees: number;
  /** yyyy-mm-dd in the instructor's timezone. */
  paidAtDate: string;
  studentName: string;
  isVoided: boolean;
};

/**
 * Edit and void for cash payments.
 *
 * Instructors record cash in a hurry and get it wrong — wrong amount, recorded
 * twice, wrong person. Until now the only correction was editing the database
 * by hand, which meant in practice the ledger just stayed wrong.
 */
export function PaymentRowActions({ row }: { row: Row }) {
  if (row.isVoided) {
    return <span className="text-xs text-ink-faint">voided</span>;
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <EditDialog row={row} />
      <VoidDialog row={row} />
    </div>
  );
}

function EditDialog({ row }: { row: Row }) {
  const [state, action] = useActionState(updatePaymentAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Edit ${row.invoiceNo}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      }
      title="Edit payment"
      description={`${row.invoiceNo} · ${row.studentName}`}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="paymentId" value={row.id} />

        <FormMessage state={state} />

        {/* What they bought stays fixed: credits may already have been spent
            against it, and changing it after the fact would leave the pass and
            the ledger describing different sales. Void and re-record instead. */}
        <p className="rounded-lg bg-paper px-3 py-2.5 text-xs text-ink-soft">
          {row.description}
          <br />
          To change what they bought, void this and record it again.
        </p>

        <Field
          label="Amount"
          htmlFor={`amount-${row.id}`}
          hint="₹"
          error={state.fields?.amount}
        >
          <Input
            id={`amount-${row.id}`}
            name="amount"
            type="number"
            min={1}
            step={1}
            defaultValue={row.amountRupees}
            required
          />
        </Field>

        <Field label="Date paid" htmlFor={`paidAt-${row.id}`}>
          <Input
            id={`paidAt-${row.id}`}
            name="paidAt"
            type="date"
            defaultValue={row.paidAtDate}
          />
        </Field>

        <Field label="Note" htmlFor={`note-${row.id}`} hint="optional">
          <Input
            id={`note-${row.id}`}
            name="note"
            placeholder="Cash, paid at the studio"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function VoidDialog({ row }: { row: Row }) {
  const [state, action] = useActionState(voidPaymentAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Void ${row.invoiceNo}`}>
          <Undo2 className="h-4 w-4" />
        </Button>
      }
      title={`Void ${row.invoiceNo}?`}
      description="The payment is marked voided and the pass it granted is taken back. Classes the student has already attended are unaffected."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="paymentId" value={row.id} />

        <FormMessage state={state} />

        <p className="text-sm text-ink-soft">
          {row.studentName} — {row.description}
        </p>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Voiding…">
            Void payment
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
