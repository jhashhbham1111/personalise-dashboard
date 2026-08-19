"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { saveScheduleRuleAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { DAY_LABELS, MODE_LABEL } from "@/lib/enums";
import { COMMON_TIMEZONES, minutesToTimeInput } from "@/lib/time";
import { parseList, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type OfferingOption = {
  id: string;
  title: string;
  mode: string;
  durationMin: number;
};

export type RuleValues = {
  id: string;
  offeringId: string;
  daysOfWeek: string;
  startTimeMinutes: number;
  durationMin: number;
  timezone: string;
  startDate: string;
  endDate: string;
  mode: string;
  venueId: string | null;
};

/**
 * The recurring-schedule builder.
 *
 * Days are toggles rather than a text field because "Mon, Wed, Fri" is how
 * instructors think about a timetable — and because a typo in a text field
 * would silently generate the wrong sixty sessions.
 */
export function RuleDialog({
  offerings,
  venues,
  defaultStartDate,
  timezone,
  rule,
  triggerLabel = "New class time",
  triggerVariant = "primary",
  triggerSize = "md",
  showIcon = false,
}: {
  offerings: OfferingOption[];
  venues: { id: string; name: string; city: string }[];
  defaultStartDate: string;
  timezone: string;
  rule?: RuleValues;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md" | "lg";
  showIcon?: boolean;
}) {
  const [state, action] = useActionState(saveScheduleRuleAction, emptyState);
  const [open, setOpen] = useState(false);

  const [days, setDays] = useState<number[]>(
    rule ? parseList<number>(rule.daysOfWeek) : [1, 3, 5],
  );
  const [offeringId, setOfferingId] = useState(
    rule?.offeringId ?? offerings[0]?.id ?? "",
  );
  const selected = offerings.find((o) => o.id === offeringId);
  const [mode, setMode] = useState(rule?.mode ?? selected?.mode ?? "ONLINE");
  // Controlled rather than a defaultValue: picking a different class has to
  // pull that class's own length across, and an uncontrolled input wouldn't.
  const [durationMin, setDurationMin] = useState(
    rule?.durationMin ?? selected?.durationMin ?? 60,
  );

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={triggerVariant} size={triggerSize}>
          {showIcon ? <Plus className="h-4 w-4" /> : null}
          {triggerLabel}
        </Button>
      }
      title={rule ? "Edit class time" : "New repeating class time"}
      description="Sessions are generated for the next 60 days and keep rolling forward."
    >
      <form action={action} className="space-y-4">
        {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
        {days.map((d) => (
          <input key={d} type="hidden" name="daysOfWeek" value={d} />
        ))}

        <FormMessage state={state} />

        <Field label="Which class?" htmlFor="offeringId" error={state.fields?.offeringId}>
          <Select
            id="offeringId"
            name="offeringId"
            value={offeringId}
            onChange={(e) => {
              setOfferingId(e.target.value);
              const next = offerings.find((o) => o.id === e.target.value);
              if (next) {
                setMode(next.mode);
                setDurationMin(next.durationMin);
              }
            }}
          >
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">
            Which days?
            {state.fields?.daysOfWeek ? (
              <span className="ml-2 text-xs font-normal text-danger-700">
                {state.fields.daysOfWeek}
              </span>
            ) : null}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(i)}
                  aria-pressed={on}
                  className={cn(
                    "h-10 w-12 rounded-lg border text-sm font-medium transition-colors",
                    on
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-line-strong bg-surface text-ink-soft hover:border-brand-300",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start time" htmlFor="startTime">
            <Input
              id="startTime"
              name="startTime"
              type="time"
              defaultValue={minutesToTimeInput(rule?.startTimeMinutes ?? 390)}
              required
            />
          </Field>

          <Field label="Length" htmlFor="durationMin" hint="minutes">
            <Input
              id="durationMin"
              name="durationMin"
              type="number"
              min={10}
              max={480}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="timezone"
            hint="the time you teach in"
          >
            <Select
              id="timezone"
              name="timezone"
              defaultValue={rule?.timezone ?? timezone}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Format" htmlFor="mode">
            <Select
              id="mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {Object.entries(MODE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="First class on" htmlFor="startDate">
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={rule?.startDate ?? defaultStartDate}
              required
            />
          </Field>

          <Field
            label="Stop after"
            htmlFor="endDate"
            hint="optional"
            error={state.fields?.endDate}
          >
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={rule?.endDate ?? ""}
            />
          </Field>
        </div>

        {mode !== "ONLINE" ? (
          <Field
            label="Venue"
            htmlFor="venueId"
            error={state.fields?.venueId}
            hint={venues.length === 0 ? "add one under Venues first" : undefined}
          >
            <Select
              id="venueId"
              name="venueId"
              defaultValue={rule?.venueId ?? ""}
              disabled={venues.length === 0}
            >
              <option value="">Choose a venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.city}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
          {days.length === 0
            ? "Pick at least one day."
            : `This creates roughly ${Math.round((days.length * 60) / 7)} sessions over the next 60 days.`}
        </p>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Generating sessions…">
            {rule ? "Save schedule" : "Create schedule"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
