"use client";

import { useActionState, useState } from "react";

import { cancelSessionAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function CancelSessionButton({
  sessionId,
  title,
  studentCount,
}: {
  sessionId: string;
  title: string;
  studentCount: number;
}) {
  const [state, action] = useActionState(cancelSessionAction, emptyState);
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="secondary">Cancel class</Button>}
      title={`Cancel "${title}"?`}
      description={
        studentCount > 0
          ? `${pluralize(studentCount, "student")} will be emailed straight away and get their session credit back, whatever the notice period.`
          : "Nobody has booked, so this just removes it from your calendar."
      }
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="sessionId" value={sessionId} />

        <FormMessage state={state} />

        <Field
          label="What should students be told?"
          htmlFor="reason"
          hint="goes into the email"
        >
          <Textarea
            id="reason"
            name="reason"
            rows={3}
            defaultValue=""
            placeholder="I'm unwell — we'll run an extra session next week to make up for it."
          />
        </Field>

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep the class</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Cancelling…">
            Cancel and notify
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
