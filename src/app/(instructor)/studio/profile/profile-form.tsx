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
    upiId: string | null;
    bankDetails: string | null;
    paymentNote: string | null;
  };
}) {
  const [state, action] = useActionState(saveProfileAction, emptyState);
  // One discipline, matching onboarding: every class inherits it, so letting
  // this drift back to several would reintroduce the "which one is this
  // class?" question the class form no longer asks. Seeded from the first
  // stored value, so a profile saved under the old multi-select still opens.
  const [discipline, setDiscipline] = useState<string>(
    initial.disciplines[0] ?? "",
  );


  return (
    <form action={action} className="space-y-5">
      {discipline ? (
        <input type="hidden" name="disciplines" value={discipline} />
      ) : null}

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
            What you teach{" "}
            <span className="font-normal text-ink-faint">
              every class you create uses this
            </span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {DISCIPLINES.map((d) => {
              const on = discipline === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiscipline(d)}
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

      {/* Not on the public page — only on the enrol page, to the student who
          is deciding to buy. That's the one place "pay me directly" needs an
          answer, and the one place it used to be missing. */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            How students pay you
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Shown to a student on the page where they choose a pass. Without
            this they&rsquo;re told to pay you and given no way to do it.
          </p>
        </div>

        <Field
          label="UPI ID"
          htmlFor="upiId"
          hint="a scannable QR is generated from this"
          error={state.fields?.upiId}
        >
          <Input
            id="upiId"
            name="upiId"
            defaultValue={initial.upiId ?? ""}
            placeholder="yourname@okhdfcbank"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Bank details"
          htmlFor="bankDetails"
          hint="optional — for anyone who'd rather transfer"
        >
          <Textarea
            id="bankDetails"
            name="bankDetails"
            rows={3}
            defaultValue={initial.bankDetails ?? ""}
            placeholder={"Ananya Iyer\nHDFC Bank · 50100XXXXXXXXX\nIFSC HDFC0000123"}
          />
        </Field>

        <Field
          label="Anything else they should know"
          htmlFor="paymentNote"
          hint="optional"
        >
          <Textarea
            id="paymentNote"
            name="paymentNote"
            rows={2}
            defaultValue={initial.paymentNote ?? ""}
            placeholder="Send me a screenshot on WhatsApp after paying and I'll send your pass code."
          />
        </Field>
      </Card>

      <SubmitButton size="lg" pendingText="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}
