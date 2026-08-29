"use client";

import { useActionState, useState } from "react";

import { createInstructorProfileAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { DISCIPLINES } from "@/lib/enums";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function OnboardingForm() {
  const [state, action] = useActionState(
    createInstructorProfileAction,
    emptyState,
  );
  /**
   * One discipline, not several.
   *
   * It used to be a multi-select, which meant every class an instructor
   * created afterwards had to ask "…but which of them is this one?" — the
   * same question twice. Asking once, here, for the thing they teach lets
   * every class simply inherit it. Someone who genuinely teaches two things
   * picks the one they lead with; the other can go in their headline.
   */
  const [selected, setSelected] = useState<string>("");

  return (
    <form action={action} className="mt-6 space-y-5">
      {selected ? (
        <input type="hidden" name="disciplines" value={selected} />
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          What do you teach?{" "}
          <span className="font-normal text-ink-faint">
            pick one — every class you create uses it
          </span>
          {state.fields?.disciplines ? (
            <span className="ml-2 text-xs font-normal text-danger-700">
              {state.fields.disciplines}
            </span>
          ) : null}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {DISCIPLINES.map((d) => {
            const on = selected === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                aria-pressed={on}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-line-strong bg-surface text-ink-soft hover:border-brand-300 hover:text-ink",
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="One-line headline"
        htmlFor="headline"
        hint="what and who for"
        error={state.fields?.headline}
      >
        <Input
          id="headline"
          name="headline"
          required
          placeholder="Hatha yoga for people who sit at desks all day"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city" error={state.fields?.city}>
          <Input id="city" name="city" required placeholder="Bengaluru" />
        </Field>
        <Field label="Years teaching" htmlFor="yearsExperience">
          <Input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={70}
            defaultValue={1}
          />
        </Field>
      </div>

      <Field
        label="About you"
        htmlFor="bio"
        hint="optional, but students read it"
      >
        <Textarea
          id="bio"
          name="bio"
          rows={5}
          placeholder="How you teach, who your classes suit, what a first session is like…"
        />
      </Field>

      <SubmitButton block size="lg" pendingText="Setting things up…">
        Create my teaching profile
      </SubmitButton>
    </form>
  );
}
