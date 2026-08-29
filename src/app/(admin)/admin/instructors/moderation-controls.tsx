"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, ShieldAlert, ShieldOff } from "lucide-react";

import { setSuspendedAction, setVerifiedAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export type ModerationTarget = {
  id: string;
  slug: string;
  name: string;
  isVerified: boolean;
  isSuspended: boolean;
};

/**
 * Both moderation actions for one instructor, sharing a message area.
 *
 * They're grouped rather than dropped in as two independent buttons so an
 * outcome ("Suspended — 4 upcoming classes still on the calendar") lands next
 * to the row it refers to, instead of at the top of a list of thirty.
 */
export function ModerationControls({ instructor }: { instructor: ModerationTarget }) {
  const [verifyState, verifyAction] = useActionState(setVerifiedAction, emptyState);
  const [suspendState, suspendAction] = useActionState(setSuspendedAction, emptyState);
  const [open, setOpen] = useState(false);
  // Only the suspend flow lives in a dialog; verifying is a plain inline button.
  useCloseOnSuccess(suspendState, setOpen);

  const message = suspendState.error || suspendState.success ? suspendState : verifyState;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {/* ------------------------------------------------------- verify */}
        <form action={verifyAction}>
          <input type="hidden" name="instructorId" value={instructor.id} />
          <input type="hidden" name="slug" value={instructor.slug} />
          <input
            type="hidden"
            name="verified"
            value={instructor.isVerified ? "" : "true"}
          />
          <SubmitButton
            size="sm"
            variant={instructor.isVerified ? "ghost" : "secondary"}
            pendingText={instructor.isVerified ? "Removing…" : "Verifying…"}
          >
            {instructor.isVerified ? (
              "Remove badge"
            ) : (
              <>
                <BadgeCheck className="h-3.5 w-3.5" />
                Verify
              </>
            )}
          </SubmitButton>
        </form>

        {/* ------------------------------------------ suspend / reinstate */}
        {instructor.isSuspended ? (
          <form action={suspendAction}>
            <input type="hidden" name="instructorId" value={instructor.id} />
            <input type="hidden" name="slug" value={instructor.slug} />
            <input type="hidden" name="suspended" value="" />
            <SubmitButton size="sm" variant="secondary" pendingText="Reinstating…">
              <ShieldOff className="h-3.5 w-3.5" />
              Reinstate
            </SubmitButton>
          </form>
        ) : (
          <Modal
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-700 hover:bg-danger-100"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Suspend
              </Button>
            }
            title={`Suspend ${instructor.name}?`}
            description="Their public page disappears and no new bookings or payments can be made. Existing bookings and passes are left alone."
          >
            <form action={suspendAction} className="space-y-4">
              <input type="hidden" name="instructorId" value={instructor.id} />
              <input type="hidden" name="slug" value={instructor.slug} />
              <input type="hidden" name="suspended" value="true" />

              <FormMessage state={suspendState} />

              <Field
                label="Reason"
                htmlFor={`reason-${instructor.id}`}
                hint="sent to the instructor word for word"
                error={suspendState.fields?.reason}
              >
                <Textarea
                  id={`reason-${instructor.id}`}
                  name="reason"
                  rows={3}
                  required
                  placeholder="e.g. Repeated no-shows reported by students on 4 and 11 August."
                />
              </Field>

              <div className="flex justify-end gap-2">
                <ModalClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </ModalClose>
                <SubmitButton variant="danger" pendingText="Suspending…">
                  Suspend account
                </SubmitButton>
              </div>
            </form>
          </Modal>
        )}
      </div>

      {message.error || message.success ? (
        <FormMessage state={message} className="text-left" />
      ) : null}
    </div>
  );
}
