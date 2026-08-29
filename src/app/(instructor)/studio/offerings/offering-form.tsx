"use client";

import { useActionState, useState } from "react";

import { saveOfferingAction } from "../actions";
import { emptyState } from "@/lib/actions";
import {
  ClassMode,
  LEVEL_LABEL,
  MODE_LABEL,
  OFFERING_TYPE_LABEL,
  SELECTABLE_MODES,
} from "@/lib/enums";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/ui/image-upload";

export type OfferingFormValues = {
  id?: string;
  coverImageUrl?: string | null;
  title: string;
  summary: string;
  description: string;
  discipline: string;
  type: string;
  mode: string;
  level: string;
  durationMin: number;
  capacity: number;
  minCapacity: number | null;
  venueId: string | null;
  isActive: boolean;
};

export function OfferingForm({
  initial,
  venues,
  profileDisciplines = [],
}: {
  initial: OfferingFormValues;
  venues: { id: string; name: string; city: string }[];
  /** The instructor's own discipline, from their profile. Every class they
   *  create inherits it, so this form never asks for one. */
  profileDisciplines?: string[];
}) {
  const [state, action] = useActionState(saveOfferingAction, emptyState);
  const [mode, setMode] = useState(initial.mode);
  const [type, setType] = useState(initial.type);
  /**
   * Never asked here. The instructor answered "what do you teach?" once, at
   * onboarding, and every class inherits that — asking again per class was
   * the same question twice. Changing it means changing the profile, which
   * is the honest place for it, since it's a fact about the teacher rather
   * than about any one class.
   *
   * Still posted, as a hidden field, because students browse by it: the
   * filter chips on /classes and /instructors are built from this column.
   */
  const discipline = profileDisciplines[0] || initial.discipline;

  const needsVenue = mode !== "ONLINE";
  const isPrivate = type === "ONE_ON_ONE";

  return (
    <form action={action} className="space-y-5">
      {initial.id ? (
        <input type="hidden" name="offeringId" value={initial.id} />
      ) : null}

      <FormMessage state={state} />

      <Card className="space-y-4 p-5">
        <Field
          label="Class name"
          htmlFor="title"
          error={state.fields?.title}
        >
          <Input
            id="title"
            name="title"
            defaultValue={initial.title}
            required
            placeholder="Morning Vinyasa Flow"
          />
        </Field>

        <Field
          label="One-line summary"
          htmlFor="summary"
          hint="shown in listings"
          error={state.fields?.summary}
        >
          <Input
            id="summary"
            name="summary"
            defaultValue={initial.summary}
            required
            placeholder="A brisk 60-minute flow to start the day, live at 6:30am."
          />
        </Field>

        <Field
          label="Full description"
          htmlFor="description"
          hint="optional — what a session is actually like"
        >
          <Textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={initial.description}
            placeholder="What you cover, what to bring, who it suits, how a first class goes…"
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Format
        </h2>

        <input type="hidden" name="discipline" value={discipline} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="type">
            <Select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(OFFERING_TYPE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Where it happens" htmlFor="mode">
            <Select
              id="mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {SELECTABLE_MODES.map((v) => (
                <option key={v} value={v}>
                  {MODE_LABEL[v]}
                </option>
              ))}
              {/* A class saved as Hybrid before the option was withdrawn keeps
                  showing its real value instead of silently reading as Online. */}
              {mode === ClassMode.HYBRID ? (
                <option value={ClassMode.HYBRID}>{MODE_LABEL.HYBRID}</option>
              ) : null}
            </Select>
          </Field>

          <Field label="Level" htmlFor="level">
            <Select id="level" name="level" defaultValue={initial.level}>
              {Object.entries(LEVEL_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Length" htmlFor="durationMin" hint="minutes">
            <Input
              id="durationMin"
              name="durationMin"
              type="number"
              min={10}
              max={480}
              step={5}
              defaultValue={initial.durationMin}
            />
          </Field>

          {/* A 1-on-1 seats one person by definition, so asking is noise —
              and the old editable field let you type 40 into it. The action
              forces 1 for this type regardless of what's posted. */}
          {!isPrivate ? (
            <Field label="Maximum students" htmlFor="capacity" hint="per session">
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                max={500}
                defaultValue={initial.capacity}
              />
            </Field>
          ) : null}

          {!isPrivate ? (
            <Field
              label="Minimum students to run"
              htmlFor="minCapacity"
              hint="blank = always runs, even for one student"
              error={state.fields?.minCapacity}
            >
              <Input
                id="minCapacity"
                name="minCapacity"
                type="number"
                min={1}
                max={500}
                defaultValue={initial.minCapacity ?? ""}
                placeholder="e.g. 3"
              />
            </Field>
          ) : null}
        </div>

        {!isPrivate ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            Set a minimum and a class that hasn&rsquo;t reached it 2 hours
            before start auto-cancels — every booked student gets their
            credit back automatically and is emailed, so you don&rsquo;t have
            to catch it yourself.
          </p>
        ) : null}

        {needsVenue ? (
          <Field
            label="Venue"
            htmlFor="venueId"
            error={state.fields?.venueId}
            hint={venues.length === 0 ? "add one under Venues first" : undefined}
          >
            <Select
              id="venueId"
              name="venueId"
              defaultValue={initial.venueId ?? ""}
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
      </Card>

      <Card className="p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial.isActive}
            className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--color-brand-600)]"
          />
          <span>
            <span className="block text-sm font-medium text-ink">
              Taking students
            </span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              Uncheck to hide this class from your public page without losing it.
            </span>
          </span>
        </label>
      </Card>

      <Card className="p-5">
        <ImageUpload
          name="coverImageUrl"
          folder="covers"
          defaultUrl={initial.coverImageUrl}
          label="Cover image"
          shape="wide"
        />
      </Card>

      <div className="flex gap-2">
        <SubmitButton size="lg" pendingText="Saving…">
          {initial.id ? "Save changes" : "Create class"}
        </SubmitButton>
      </div>
    </form>
  );
}
