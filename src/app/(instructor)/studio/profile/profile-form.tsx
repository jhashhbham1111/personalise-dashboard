"use client";

import { useActionState, useState } from "react";

import { saveProfileAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { DISCIPLINES } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({
  initial,
}: {
  initial: {
    headline: string;
    bio: string;
    city: string;
    yearsExperience: number;
    disciplines: string[];
    languages: string[];
    certifications: string[];
    instagramUrl: string | null;
    youtubeUrl: string | null;
    websiteUrl: string | null;
  };
}) {
  const [state, action] = useActionState(saveProfileAction, emptyState);
  const [disciplines, setDisciplines] = useState<string[]>(initial.disciplines);

  function toggle(d: string) {
    setDisciplines((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  return (
    <form action={action} className="space-y-5">
      {disciplines.map((d) => (
        <input key={d} type="hidden" name="disciplines" value={d} />
      ))}

      <FormMessage state={state} />

      <Card className="space-y-4 p-5">
        <Field
          label="Headline"
          htmlFor="headline"
          hint="the first thing students read"
          error={state.fields?.headline}
        >
          <Input
            id="headline"
            name="headline"
            defaultValue={initial.headline}
            required
            placeholder="Hatha & Vinyasa yoga for people who sit at desks all day"
          />
        </Field>

        <Field
          label="About you"
          htmlFor="bio"
          hint="how you teach, who it suits — blank line between paragraphs"
        >
          <Textarea
            id="bio"
            name="bio"
            rows={7}
            defaultValue={initial.bio}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={state.fields?.city}>
            <Input id="city" name="city" defaultValue={initial.city} required />
          </Field>
          <Field label="Years teaching" htmlFor="yearsExperience">
            <Input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={70}
              defaultValue={initial.yearsExperience}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            What you teach
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DISCIPLINES.map((d) => {
              const on = disciplines.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
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
          label="Languages"
          htmlFor="languages"
          hint="comma separated"
        >
          <Input
            id="languages"
            name="languages"
            defaultValue={initial.languages.join(", ")}
            placeholder="English, Hindi, Tamil"
          />
        </Field>

        <Field
          label="Training & certifications"
          htmlFor="certifications"
          hint="one per line"
        >
          <Textarea
            id="certifications"
            name="certifications"
            rows={3}
            defaultValue={initial.certifications.join("\n")}
            placeholder={"RYT-500, Yoga Alliance\nYoga Therapy for Back Care, SVYASA"}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Links
        </h2>
        <Field label="Instagram" htmlFor="instagramUrl">
          <Input
            id="instagramUrl"
            name="instagramUrl"
            type="url"
            defaultValue={initial.instagramUrl ?? ""}
            placeholder="https://instagram.com/…"
          />
        </Field>
        <Field label="YouTube" htmlFor="youtubeUrl">
          <Input
            id="youtubeUrl"
            name="youtubeUrl"
            type="url"
            defaultValue={initial.youtubeUrl ?? ""}
            placeholder="https://youtube.com/@…"
          />
        </Field>
        <Field label="Website" htmlFor="websiteUrl">
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            defaultValue={initial.websiteUrl ?? ""}
          />
        </Field>
      </Card>

      <SubmitButton size="lg" pendingText="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}
