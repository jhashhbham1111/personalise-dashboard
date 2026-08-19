"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { renameSessionAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function RenameSessionButton({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  const [state, action] = useActionState(renameSessionAction, emptyState);
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary">
          <Pencil className="h-4 w-4" />
          Rename
        </Button>
      }
      title="Rename this class"
      description="Renames just this one date — the offering it's under, and every other session on the schedule, keep their own name."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="sessionId" value={sessionId} />

        <FormMessage state={state} />

        <Field label="Class name" htmlFor="title" error={state.fields?.title}>
          <Input
            id="title"
            name="title"
            defaultValue={title}
            required
            placeholder="Morning Vinyasa Flow"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <SubmitButton pendingText="Saving…">Save name</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
