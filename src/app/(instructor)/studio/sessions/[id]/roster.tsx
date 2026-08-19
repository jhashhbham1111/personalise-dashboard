"use client";

import { useActionState, useState } from "react";
import { Check, Minus, X } from "lucide-react";

import { markAttendanceAction, removeBookingAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { Attendance } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Modal, ModalClose } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

type Student = {
  bookingId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  attendance: string;
};

const OPTIONS = [
  { value: Attendance.ATTENDED, label: "Here", icon: Check, tone: "ok" },
  { value: Attendance.NO_SHOW, label: "No show", icon: X, tone: "bad" },
  { value: Attendance.PENDING, label: "—", icon: Minus, tone: "neutral" },
] as const;

/**
 * The register.
 *
 * One form for the whole class rather than a save per student — an instructor
 * marks a register in one pass, and per-row saves would mean twenty round trips
 * and twenty chances for one to silently fail.
 */
export function Roster({
  sessionId,
  students,
  allowRemoval,
}: {
  sessionId: string;
  students: Student[];
  allowRemoval: boolean;
}) {
  const [state, action] = useActionState(markAttendanceAction, emptyState);
  const [marks, setMarks] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.bookingId, s.attendance])),
  );

  function markAll(value: string) {
    setMarks(Object.fromEntries(students.map((s) => [s.bookingId, value])));
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      {students.map((s) => (
        <input
          key={s.bookingId}
          type="hidden"
          name={`attendance:${s.bookingId}`}
          value={marks[s.bookingId] ?? Attendance.PENDING}
        />
      ))}

      <FormMessage state={state} />

      <Card className="divide-y divide-line">
        {students.map((s) => (
          <div key={s.bookingId} className="flex items-center gap-3 p-3.5">
            <Avatar name={s.name} src={s.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{s.name}</p>
              <p className="truncate text-xs text-ink-faint">
                {s.email}
                {s.phone ? ` · ${s.phone}` : ""}
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label={`Attendance for ${s.name}`}
              className="flex shrink-0 overflow-hidden rounded-lg border border-line-strong"
            >
              {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const on = (marks[s.bookingId] ?? Attendance.PENDING) === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={opt.label}
                    onClick={() =>
                      setMarks((m) => ({ ...m, [s.bookingId]: opt.value }))
                    }
                    className={cn(
                      "grid h-8 w-9 place-items-center border-r border-line-strong transition-colors last:border-r-0",
                      on
                        ? opt.tone === "ok"
                          ? "bg-brand-600 text-white"
                          : opt.tone === "bad"
                            ? "bg-danger-500 text-white"
                            : "bg-[var(--color-line)] text-ink-soft"
                        : "bg-surface text-ink-faint hover:bg-brand-50",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>

            {allowRemoval ? (
              <RemoveStudentButton
                bookingId={s.bookingId}
                sessionId={sessionId}
                name={s.name}
              />
            ) : null}
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Saving register…">Save register</SubmitButton>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => markAll(Attendance.ATTENDED)}
        >
          Mark everyone present
        </Button>
      </div>
    </form>
  );
}

function RemoveStudentButton({
  bookingId,
  sessionId,
  name,
}: {
  bookingId: string;
  sessionId: string;
  name: string;
}) {
  const [state, action] = useActionState(removeBookingAction, emptyState);
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="icon" variant="ghost" aria-label={`Remove ${name}`}>
          <X className="h-4 w-4" />
        </Button>
      }
      title={`Remove ${name} from this class?`}
      description="They'll be notified and their session credit goes straight back on their pass. If anyone is waiting, the first person on the waitlist takes the seat."
    >
      {/* Nested inside the register form would be invalid HTML, so this posts on its own. */}
      <div>
        <form action={action} className="space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="sessionId" value={sessionId} />

          <FormMessage state={state} />

          <div className="flex justify-end gap-2">
            <ModalClose asChild>
              <Button variant="secondary">Keep them</Button>
            </ModalClose>
            <SubmitButton variant="danger" pendingText="Removing…">
              Remove student
            </SubmitButton>
          </div>
        </form>
      </div>
    </Modal>
  );
}
