"use client";

import { useActionState, useState } from "react";

import { deleteOfferingAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function ArchiveOfferingButton({
  offeringId,
  title,
}: {
  offeringId: string;
  title: string;
}) {
  const [state, action] = useActionState(deleteOfferingAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" className="text-danger-700 hover:bg-danger-100">
          Archive this class
        </Button>
      }
      title={`Archive "${title}"?`}
      description="It disappears from your public page and stops generating new sessions. Students holding a pass keep it, and nothing in your records is deleted."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="offeringId" value={offeringId} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Archiving…">
            Archive class
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
