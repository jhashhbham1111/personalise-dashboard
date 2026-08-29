"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import { deletePostAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeletePostButton({
  postId,
  title,
}: {
  postId: string;
  title: string;
}) {
  const [state, action] = useActionState(deletePostAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Delete "${title}"`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      }
      title="Delete this update?"
      description={`"${title}" will be removed from your public page. Notifications already sent stay in students' inboxes.`}
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="postId" value={postId} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Deleting…">
            Delete update
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
