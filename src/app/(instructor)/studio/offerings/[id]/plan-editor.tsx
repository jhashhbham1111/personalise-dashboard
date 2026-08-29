"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { deletePlanAction, savePlanAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { PLAN_KIND_LABEL } from "@/lib/enums";
import { formatMoney, pluralize, rupeesToPaise } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type Plan = {
  id: string;
  name: string;
  kind: string;
  amountRupees: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  description: string | null;
};

export function PlanEditor({
  offeringId,
  plans,
}: {
  offeringId: string;
  plans: Plan[];
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Passes & prices</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Offer a drop-in, a class pack, or a monthly pass. Most instructors
            offer all three.
          </p>
        </div>
        <PlanDialog
          offeringId={offeringId}
          trigger={
            <Button size="sm" variant="secondary">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          }
        />
      </div>

      {plans.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong p-4 text-center text-sm text-ink-soft">
          No passes yet — students can&rsquo;t enrol until you add one.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {p.sessionsIncluded === null
                    ? `${PLAN_KIND_LABEL[p.kind]} · unlimited`
                    : pluralize(p.sessionsIncluded, "class", "classes")}
                  {p.validityDays ? ` · valid ${p.validityDays} days` : ""}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-ink">
                {formatMoney(rupeesToPaise(p.amountRupees))}
              </span>
              <PlanDialog
                offeringId={offeringId}
                plan={p}
                trigger={
                  <Button size="sm" variant="ghost">
                    Edit
                  </Button>
                }
              />
              <RetirePlanButton offeringId={offeringId} plan={p} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PlanDialog({
  offeringId,
  plan,
  trigger,
}: {
  offeringId: string;
  plan?: Plan;
  trigger: React.ReactNode;
}) {
  const [state, action] = useActionState(savePlanAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);
  const [kind, setKind] = useState(plan?.kind ?? "PER_SESSION");

  // A monthly pass is unlimited within its validity, so the session count is
  // meaningless for it.
  const showSessionCount = kind !== "MONTHLY";

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={plan ? "Edit pass" : "Add a pass"}
      description="What a student buys, and what it entitles them to."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="offeringId" value={offeringId} />
        {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}

        <FormMessage state={state} />

        <Field label="Name" htmlFor={`name-${plan?.id ?? "new"}`} error={state.fields?.name}>
          <Input
            id={`name-${plan?.id ?? "new"}`}
            name="name"
            defaultValue={plan?.name}
            required
            placeholder="10-class pack"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor={`kind-${plan?.id ?? "new"}`}>
            <Select
              id={`kind-${plan?.id ?? "new"}`}
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {Object.entries(PLAN_KIND_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Price"
            htmlFor={`amount-${plan?.id ?? "new"}`}
            hint="₹"
            error={state.fields?.amount}
          >
            <Input
              id={`amount-${plan?.id ?? "new"}`}
              name="amount"
              type="number"
              min={1}
              step={1}
              defaultValue={plan?.amountRupees}
              required
              placeholder="3800"
            />
          </Field>

          {showSessionCount ? (
            <Field
              label="Classes included"
              htmlFor={`sessions-${plan?.id ?? "new"}`}
            >
              <Input
                id={`sessions-${plan?.id ?? "new"}`}
                name="sessionsIncluded"
                type="number"
                min={1}
                defaultValue={plan?.sessionsIncluded ?? 1}
              />
            </Field>
          ) : null}

          <Field
            label="Valid for"
            htmlFor={`validity-${plan?.id ?? "new"}`}
            hint="days"
          >
            <Input
              id={`validity-${plan?.id ?? "new"}`}
              name="validityDays"
              type="number"
              min={1}
              max={365}
              defaultValue={plan?.validityDays ?? 30}
            />
          </Field>
        </div>

        <Field
          label="Note"
          htmlFor={`desc-${plan?.id ?? "new"}`}
          hint="optional, shown under the price"
        >
          <Textarea
            id={`desc-${plan?.id ?? "new"}`}
            name="description"
            rows={2}
            defaultValue={plan?.description ?? ""}
            placeholder="Works out to ₹380 a class."
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Saving…">
            {plan ? "Save pass" : "Add pass"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

function RetirePlanButton({
  offeringId,
  plan,
}: {
  offeringId: string;
  plan: Plan;
}) {
  const [state, action] = useActionState(deletePlanAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Retire ${plan.name}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      }
      title={`Retire "${plan.name}"?`}
      description="It stops being sellable. Students partway through it keep every session they've already paid for."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="offeringId" value={offeringId} />
        <input type="hidden" name="planId" value={plan.id} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Retiring…">
            Retire pass
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
