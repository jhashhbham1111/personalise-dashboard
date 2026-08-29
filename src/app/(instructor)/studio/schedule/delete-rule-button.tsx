"use client";

import { useActionState, useState } from "react";

import { deleteScheduleRuleAction } from "../actions";
import { emptyState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose, useCloseOnSuccess } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteRuleButton({
  ruleId,
  label,
}: {
  ruleId: string;
  label: string;
}) {
  const [state, action] = useActionState(deleteScheduleRuleAction, emptyState);
  const [open, setOpen] = useState(false);
  useCloseOnSuccess(state, setOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="ghost" className="text-danger-700 hover:bg-danger-100">
          Stop
        </Button>
      }
      title="Stop this repeating time?"
      description={`${label}. Empty future sessions are removed. Any session that already has bookings stays put — cancel those individually so students get told.`}
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="ruleId" value={ruleId} />

        <FormMessage state={state} />

        <div className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button variant="secondary">Keep it running</Button>
          </ModalClose>
          <SubmitButton variant="danger" pendingText="Stopping…">
            Stop schedule
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
