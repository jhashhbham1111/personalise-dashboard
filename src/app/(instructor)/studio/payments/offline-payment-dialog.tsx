"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";

import { recordOfflinePaymentAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type PlanOption = { id: string; label: string; amountRupees: number };

/**
 * Cash and bank-transfer payments.
 *
 * Plenty of students in a studio still pay in person. Recording it here creates
 * the same enrolment and invoice a card payment would, so the instructor has one
 * ledger rather than an app plus a notebook.
 */
export function OfflinePaymentDialog({
  plans,
  students,
}: {
  plans: PlanOption[];
  students: { id: string; name: string; email: string }[];
}) {
  const [state, action] = useActionState(recordOfflinePaymentAction, emptyState);
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");

  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Banknote className="h-4 w-4" />
          Record a payment
        </Button>
      }
      title="Record a cash payment"
      description="For someone who paid you in person, by UPI or by bank transfer. This activates their pass immediately."
    >
      <form action={action} className="space-y-4">
        <FormMessage state={state} />

        <Field
          label="Student's email"
          htmlFor="studentEmail"
          error={state.fields?.studentEmail}
          hint={
            students.length > 0
              ? "Start typing to pick someone you've taught before, or enter a new student's email."
              : "The email they signed up with."
          }
        >
          <Input
            id="studentEmail"
            name="studentEmail"
            type="email"
            list="known-students"
            placeholder="student@example.com"
            autoComplete="off"
            required
          />
          {/* Previous students are a convenience, not a constraint — the whole
              point of this dialog is enrolling someone for the first time. */}
          <datalist id="known-students">
            {students.map((s) => (
              <option key={s.id} value={s.email}>
                {s.name}
              </option>
            ))}
          </datalist>
        </Field>

        <Field label="What did they buy?" htmlFor="planId">
          <Select
            id="planId"
            name="planId"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            required
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Amount received"
          htmlFor="amount"
          hint="₹ — edit if you gave a discount"
        >
          <Input
            id="amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            value={undefined}
            defaultValue={selectedPlan?.amountRupees}
            key={planId}
            required
          />
        </Field>

        <Field label="Note" htmlFor="note" hint="optional">
          <Input
            id="note"
            name="note"
            placeholder="Cash, paid at the studio"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
