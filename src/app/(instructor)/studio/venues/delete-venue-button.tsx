"use client";

import { useActionState, useState } from "react";

import { deleteVenueAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteVenueButton({
  venueId,
  name,
}: {
  venueId: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteVenueAction, emptyState);
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="ghost" className="text-danger-700 hover:bg-danger-100">
          Remove
        </Button>
      }
      title={`Remove ${name}?`}
      description="Classes already scheduled there keep the address on their booking. You just can't pick it for new ones."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="venueId" value={venueId} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Removing…">
            Remove venue
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
