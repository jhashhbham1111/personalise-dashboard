"use client";

import { useActionState, useState } from "react";
import { GraduationCap, Sparkles } from "lucide-react";

import { signupAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  {
    value: "learn",
    label: "I want to learn",
    description: "Browse instructors, book classes, join live sessions.",
    icon: GraduationCap,
  },
  {
    value: "teach",
    label: "I want to teach",
    description: "Publish your classes, take bookings and get paid.",
    icon: Sparkles,
  },
] as const;

export function SignupForm({
  defaultIntent,
}: {
  defaultIntent: "learn" | "teach";
}) {
  const [state, action] = useActionState(signupAction, emptyState);
  const [intent, setIntent] = useState<"learn" | "teach">(defaultIntent);

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="intent" value={intent} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          What brings you here?
        </legend>
        <div className="grid gap-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = intent === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIntent(opt.value)}
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                    : "border-line-strong bg-surface hover:border-brand-200",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    selected ? "text-brand-600" : "text-ink-faint",
                  )}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field label="Full name" htmlFor="name" error={state.fields?.name}>
        <Input id="name" name="name" autoComplete="name" required placeholder="Meera Krishnan" />
      </Field>

      <Field label="Email" htmlFor="email" error={state.fields?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Field
        label="Phone"
        htmlFor="phone"
        hint="optional — helps your instructor find you"
        error={state.fields?.phone}
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="8 characters or more"
        error={state.fields?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <SubmitButton block size="lg" pendingText="Creating your account…">
        {intent === "teach" ? "Start teaching" : "Start learning"}
      </SubmitButton>
    </form>
  );
}
