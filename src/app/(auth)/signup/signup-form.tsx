"use client";

import { useActionState, useRef, useState } from "react";
import { GraduationCap, Sparkles } from "lucide-react";

import { signupAction } from "../actions";
import { emptyState } from "@/lib/actions";
import {
  MIN_PASSWORD_LENGTH,
  validateSignup,
  type SignupValues,
} from "@/lib/signup-validation";
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

type FieldName = keyof SignupValues;

const FIELDS: FieldName[] = ["name", "email", "password", "phone"];

export function SignupForm({
  defaultIntent,
}: {
  defaultIntent: "learn" | "teach";
}) {
  const [state, action] = useActionState(signupAction, emptyState);
  const [intent, setIntent] = useState<"learn" | "teach">(defaultIntent);

  const formRef = useRef<HTMLFormElement>(null);
  // Client-side errors only. The inputs themselves are deliberately
  // **uncontrolled**: a `value` prop would mean React owns the text, and
  // anything typed before hydration finishes gets wiped the moment it takes
  // over — silently erasing the name of anyone who starts filling the form on
  // a slow connection. Reading the DOM keeps whatever they typed.
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  // Server errors are dropped for a field the moment it is edited, so
  // "Already registered" stops sitting under an address they have since
  // changed. Tagged with the response it belongs to, so a new response makes
  // its own errors current without needing an effect to clear this.
  const [edited, setEdited] = useState<{
    forState: unknown;
    fields: Partial<Record<FieldName, boolean>>;
  }>({ forState: null, fields: {} });

  const editedFields = edited.forState === state ? edited.fields : {};

  function readValues(): SignupValues {
    const form = formRef.current;
    if (!form) return { name: "", email: "", password: "", phone: "" };
    const data = new FormData(form);
    const get = (k: FieldName) => String(data.get(k) ?? "");
    return {
      name: get("name"),
      email: get("email"),
      password: get("password"),
      phone: get("phone"),
    };
  }

  function errorFor(field: FieldName): string | undefined {
    return errors[field] ?? (editedFields[field] ? undefined : state.fields?.[field]);
  }

  const fieldProps = (field: FieldName) => ({
    // Validated on blur, not on every keystroke: "That doesn't look like an
    // email address" is true and useless at the letter `a`.
    onBlur: () =>
      setErrors((e) => ({ ...e, [field]: validateSignup(readValues())[field] })),
    onChange: () => {
      // Once a field is showing an error, correcting it clears the message as
      // soon as it's actually valid rather than making them blur again.
      setErrors((e) =>
        e[field] ? { ...e, [field]: validateSignup(readValues())[field] } : e,
      );
      setEdited((prev) => ({
        forState: state,
        fields:
          prev.forState === state
            ? { ...prev.fields, [field]: true }
            : { [field]: true },
      }));
    },
    "aria-invalid": errorFor(field) ? true : undefined,
  });

  return (
    <form
      ref={formRef}
      action={action}
      // Stops a submit already known to fail, so nobody waits on a round trip
      // to be told about something the browser could see. The action re-checks
      // everything regardless — this is a courtesy, not the guard.
      onSubmit={(e) => {
        const found = validateSignup(readValues());
        const bad = FIELDS.filter((f) => found[f]);
        if (bad.length === 0) return;
        e.preventDefault();
        setErrors(found);
        formRef.current
          ?.querySelector<HTMLInputElement>(`[name="${bad[0]}"]`)
          ?.focus();
      }}
      className="mt-6 space-y-5"
      noValidate
    >
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

      <Field label="Full name" htmlFor="name" error={errorFor("name")}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          placeholder="Meera Krishnan"
          {...fieldProps("name")}
        />
      </Field>

      <Field label="Email" htmlFor="email" error={errorFor("email")}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...fieldProps("email")}
        />
      </Field>

      <Field label="Phone" htmlFor="phone" hint="optional" error={errorFor("phone")}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          {...fieldProps("phone")}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint={`${MIN_PASSWORD_LENGTH} characters or more`}
        error={errorFor("password")}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          {...fieldProps("password")}
        />
      </Field>

      <SubmitButton block size="lg" pendingText="Creating your account…">
        {intent === "teach" ? "Start teaching" : "Start learning"}
      </SubmitButton>
    </form>
  );
}
