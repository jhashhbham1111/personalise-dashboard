"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteVideoAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteVideoButton({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [state, action] = useActionState(deleteVideoAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Delete ${title}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      }
      title={`Delete "${title}"?`}
      description="It disappears from your page and the video library. The file itself, wherever you host it, is untouched."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="videoId" value={videoId} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Deleting…">
            Delete video
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
