"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3 } from "lucide-react";

import { bookSessionAction } from "../../actions";
import { emptyState } from "@/lib/actions";
import { isWithinJoinWindow } from "@/lib/booking-policy";
import { formatRelative } from "@/lib/time";
import { pluralize } from "@/lib/utils";
import { Alert } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";

export function BookingPanel({
  sessionId,
  offeringSlug,
  instructorSlug,
  isSignedIn,
  isFull,
  seatsLeft,
  cancelled,
  existingStatus,
  waitlistPosition,
  hasEnrollment,
  sessionsRemaining,
  startsAt,
  endsAt,
  status,
  mode,
}: {
  sessionId: string;
  offeringSlug: string;
  instructorSlug: string;
  isSignedIn: boolean;
  isFull: boolean;
  seatsLeft: number;
  cancelled: boolean;
  existingStatus: string | null;
  waitlistPosition: number | null;
  hasEnrollment: boolean;
  sessionsRemaining: number | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  mode: string;
}) {
  const [state, action] = useActionState(bookSessionAction, emptyState);

  if (cancelled) {
    return (
      <div>
        <p className="font-semibold text-ink">Class cancelled</p>
        <p className="mt-1 text-sm text-ink-soft">
          Bookings are closed for this session.
        </p>
        <ButtonLink
          href={`/classes?instructor=${instructorSlug}`}
          variant="secondary"
          block
          className="mt-4"
        >
          Find another class
        </ButtonLink>
      </div>
    );
  }

  // Already in — show status and the join button when the window opens.
  if (existingStatus === "CONFIRMED" || state.success) {
    const canJoin =
      mode !== "OFFLINE" && status !== "COMPLETED" && isWithinJoinWindow(startsAt, endsAt);
    return (
      <div>
        <p className="inline-flex items-center gap-2 font-semibold text-brand-700">
          <CheckCircle2 className="h-5 w-5" />
          {existingStatus === "CONFIRMED" ? "You're booked" : state.success}
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">
          Starts {formatRelative(startsAt)}.
        </p>
        {mode !== "OFFLINE" ? (
          canJoin ? (
            <ButtonLink href={`/live/${sessionId}`} block className="mt-4">
              Join the live class
            </ButtonLink>
          ) : (
            <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
              The join button appears 15 minutes before the class starts.
            </p>
          )
        ) : null}
        <ButtonLink
          href="/dashboard/bookings"
          variant="secondary"
          block
          className="mt-2"
        >
          Manage my bookings
        </ButtonLink>
      </div>
    );
  }

  if (existingStatus === "WAITLISTED") {
    return (
      <div>
        <p className="inline-flex items-center gap-2 font-semibold text-accent-700">
          <Clock3 className="h-5 w-5" />
          You&rsquo;re on the waitlist
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">
          {waitlistPosition
            ? `Currently #${waitlistPosition} in line. `
            : ""}
          We&rsquo;ll email you the moment a seat opens up.
        </p>
        <ButtonLink
          href="/dashboard/bookings"
          variant="secondary"
          block
          className="mt-4"
        >
          Manage my bookings
        </ButtonLink>
      </div>
    );
  }

  // Not signed in.
  if (!isSignedIn) {
    return (
      <div>
        <p className="font-semibold text-ink">
          {isFull ? "This class is full" : `${pluralize(seatsLeft, "seat")} left`}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Sign in to {isFull ? "join the waitlist" : "book your place"}.
        </p>
        <ButtonLink
          href={`/login?next=${encodeURIComponent(`/classes/${sessionId}`)}`}
          block
          className="mt-4"
        >
          Sign in to book
        </ButtonLink>
        <ButtonLink href="/signup" variant="secondary" block className="mt-2">
          Create an account
        </ButtonLink>
      </div>
    );
  }

  // Signed in but no pass for this offering yet.
  if (!hasEnrollment) {
    return (
      <div>
        <p className="font-semibold text-ink">
          {isFull ? "This class is full" : `${pluralize(seatsLeft, "seat")} left`}
        </p>
        <p className="mt-1.5 text-sm text-ink-soft">
          You need a pass for this class before you can book a session. Drop-in
          passes start from a single class.
        </p>
        <ButtonLink
          href={`/i/${instructorSlug}/enrol/${offeringSlug}`}
          block
          className="mt-4"
        >
          See passes & prices
        </ButtonLink>
      </div>
    );
  }

  // Ready to book.
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />

      <p className="font-semibold text-ink">
        {isFull ? "This class is full" : `${pluralize(seatsLeft, "seat")} left`}
      </p>
      <p className="mt-1.5 text-sm text-ink-soft">
        {sessionsRemaining === null
          ? "Your pass covers unlimited classes."
          : `${pluralize(sessionsRemaining, "session")} left on your pass.`}
      </p>

      {state.error ? (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      ) : null}

      <SubmitButton
        block
        size="lg"
        className="mt-4"
        variant={isFull ? "secondary" : "primary"}
        pendingText={isFull ? "Joining waitlist…" : "Booking…"}
      >
        {isFull ? "Join the waitlist" : "Book my place"}
      </SubmitButton>

      <p className="mt-3 text-center text-xs text-ink-faint">
        Free cancellation up to 4 hours before the class.{" "}
        <Link href="/dashboard/bookings" className="underline">
          Manage bookings
        </Link>
      </p>
    </form>
  );
}
