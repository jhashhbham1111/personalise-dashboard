"use client";

import { useActionState, useState } from "react";

import { cancelBookingAction } from "@/app/(marketing)/actions";
import { emptyState } from "@/lib/actions";
import { canCancelFree, FREE_CANCELLATION_HOURS } from "@/lib/booking-policy";
import { Alert } from "./ui/page";
import { Button } from "./ui/button";
import { Modal, ModalClose } from "./ui/modal";
import { SubmitButton } from "./ui/submit-button";

export function CancelBookingButton({
  bookingId,
  sessionTitle,
  startsAt,
}: {
  bookingId: string;
  sessionTitle: string;
  startsAt: Date;
}) {
  const [state, action] = useActionState(cancelBookingAction, emptyState);
  const [open, setOpen] = useState(false);
  const free = canCancelFree(new Date(startsAt));

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
      }
      title={`Cancel ${sessionTitle}?`}
      description={
        free
          ? "You're within the free cancellation window, so the session credit goes back on your pass."
          : `This class starts in under ${FREE_CANCELLATION_HOURS} hours, so the session credit won't be returned.`
      }
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? <Alert tone="success">{state.success}</Alert> : null}

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep my place</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Cancelling…">
            Cancel booking
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
