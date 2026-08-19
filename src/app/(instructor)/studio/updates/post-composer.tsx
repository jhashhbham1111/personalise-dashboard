"use client";

import { useActionState, useRef, useState } from "react";

import { savePostAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { POST_TYPE_LABEL, VISIBILITY_LABEL } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Inline composer rather than a dialog.
 *
 * A daily update is a thirty-second job an instructor does on their phone
 * between classes — putting it behind a button would be one tap too many.
 */
export function PostComposer() {
  const [state, action] = useActionState(savePostAction, emptyState);
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card className="p-5">
      <form
        ref={formRef}
        action={action}
        className="space-y-4"
        onFocus={() => setExpanded(true)}
      >
        <FormMessage state={state} />

        <Field label="Headline" htmlFor="title" error={state.fields?.title}>
          <Input
            id="title"
            name="title"
            required
            placeholder="No 6:30 class this Friday"
          />
        </Field>

        <div className={cn(expanded ? "space-y-4" : "hidden")}>
          <Field
            label="What do you want to say?"
            htmlFor="body"
            error={state.fields?.body}
          >
            <Textarea
              id="body"
              name="body"
              rows={5}
              placeholder="Leave a blank line between paragraphs."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind" htmlFor="type">
              <Select id="type" name="type" defaultValue="DAILY_UPDATE">
                {Object.entries(POST_TYPE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Who sees it" htmlFor="visibility">
              <Select id="visibility" name="visibility" defaultValue="PUBLIC">
                {Object.entries(VISIBILITY_LABEL)
                  .filter(([v]) => v !== "PAID")
                  .map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="notifyStudents"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--color-brand-600)]"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Notify my students
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                Everyone with an active pass gets this in their notifications.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <SubmitButton pendingText="Posting…">Post update</SubmitButton>
          </div>
        </div>
      </form>
    </Card>
  );
}
