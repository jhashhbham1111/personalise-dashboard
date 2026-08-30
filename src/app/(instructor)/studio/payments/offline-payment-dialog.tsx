"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";

import { recordOfflinePaymentAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { StudentPicker } from "./student-picker";

type PlanOption = {
  id: string;
  label: string;
  amountRupees: number;
  offeringId: string;
};

const CUSTOM = "__custom__";

/**
 * Cash and bank-transfer payments.
 *
 * Plenty of students in a studio still pay in person. Recording it here creates
 * the same enrolment and invoice a card payment would, so the instructor has one
 * ledger rather than an app plus a notebook.
 */
export function OfflinePaymentDialog({
  plans,
  offerings,
}: {
  plans: PlanOption[];
  offerings: { id: string; title: string }[];
}) {
  const [state, action] = useActionState(recordOfflinePaymentAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);
  const [planId, setPlanId] = useState(plans[0]?.id ?? CUSTOM);

  const selectedPlan = plans.find((p) => p.id === planId);
  const isCustom = planId === CUSTOM;

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

        <StudentPicker error={state.fields?.student} />

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
            <option value={CUSTOM}>Something else…</option>
          </Select>
        </Field>

        {/* Not every pack an instructor sells is a saved plan — a family rate,
            a one-off arrangement, a pack carried over from before. Without
            this those either went unrecorded or got logged against the wrong
            plan, which quietly corrupts the ledger. */}
        {isCustom ? (
          <div className="space-y-4 rounded-lg border border-line-strong bg-paper p-3.5">
            <Field
              label="Pass name"
              htmlFor="customLabel"
              error={state.fields?.customLabel}
            >
              <Input
                id="customLabel"
                name="customLabel"
                placeholder="6-class family pack"
                required
              />
            </Field>

            <Field
              label="For which class?"
              htmlFor="customOfferingId"
              error={state.fields?.customOfferingId}
            >
              <Select id="customOfferingId" name="customOfferingId" required>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Classes included"
                htmlFor="customSessions"
                hint="blank = unlimited"
              >
                <Input
                  id="customSessions"
                  name="customSessions"
                  type="number"
                  min={1}
                  placeholder="6"
                />
              </Field>
              <Field
                label="Valid for"
                htmlFor="customValidity"
                hint="days, blank = no expiry"
              >
                <Input
                  id="customValidity"
                  name="customValidity"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="60"
                />
              </Field>
            </div>
          </div>
        ) : null}

        <Field
          label="Amount received"
          htmlFor="amount"
          hint="₹ — edit if you gave a discount"
          error={state.fields?.amount}
        >
          <Input
            id="amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            defaultValue={selectedPlan?.amountRupees}
            key={planId}
            required
          />
        </Field>

        <Field
          label="Payment date"
          htmlFor="paidAt"
          hint="optional — defaults to today"
        >
          <Input id="paidAt" name="paidAt" type="date" />
        </Field>

        <Field label="Note" htmlFor="note" hint="optional">
          <Input id="note" name="note" placeholder="Cash, paid at the studio" />
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
