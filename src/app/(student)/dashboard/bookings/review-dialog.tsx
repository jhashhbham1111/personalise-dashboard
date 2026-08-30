"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";

import { submitReviewAction } from "./actions";
import { emptyState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function ReviewDialog({
  instructorId,
  instructorName,
  existingRating,
}: {
  instructorId: string;
  instructorName: string;
  existingRating?: number;
}) {
  const [state, action] = useActionState(submitReviewAction, emptyState);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(0);
  const [rating, setRating] = useState(existingRating ?? 0);

  // The shared hook every other dialog uses. The hand-rolled effect it
  // replaces re-fired on each render while a success state was live, which
  // React 19's lint rule flags as cascading renders — and which stopped the
  // dialog reopening cleanly for a second edit.
  useCloseOnSuccess(state, setOpen);

  const isEdit = Boolean(existingRating);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary" size="sm">
          {isEdit ? "Edit review" : "Leave a review"}
        </Button>
      }
      title={isEdit ? "Update your review" : `Review ${instructorName}`}
      description="Your feedback helps other students discover great instructors."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="instructorId" value={instructorId} />
        <input type="hidden" name="rating" value={rating} />

        <FormMessage state={state} />

        {/* Star picker */}
        <Field label="Your rating" htmlFor="stars">
          <div
            id="stars"
            className="flex items-center gap-1"
            onMouseLeave={() => setHovered(0)}
            role="group"
            aria-label="Star rating"
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = star <= (hovered || rating);
              return (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                  aria-pressed={star === rating}
                  onMouseEnter={() => setHovered(star)}
                  onClick={() => setRating(star)}
                  className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <Star
                    className={cn(
                      "h-7 w-7 transition-colors",
                      filled
                        ? "fill-amber-400 text-amber-400"
                        : "fill-transparent text-ink-faint",
                    )}
                  />
                </button>
              );
            })}
            {rating > 0 ? (
              <span className="ml-2 text-sm text-ink-soft">
                {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
              </span>
            ) : null}
          </div>
          {rating === 0 ? (
            <p className="mt-1 text-xs text-ink-faint">Click a star to rate</p>
          ) : null}
        </Field>

        {/* Comment */}
        <Field label="Comment" htmlFor="comment" hint="optional">
          <textarea
            id="comment"
            name="comment"
            rows={3}
            placeholder="What did you enjoy? What could be better?"
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Submitting…" disabled={rating === 0}>
            {isEdit ? "Update review" : "Submit review"}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
