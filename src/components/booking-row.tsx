import Link from "next/link";
import { MapPin, Video } from "lucide-react";

import { BookingStatus } from "@/lib/enums";
import { isWithinJoinWindow } from "@/lib/booking-policy";
import { formatDate, formatTime } from "@/lib/time";
import { Badge } from "./ui/badge";
import { ButtonLink } from "./ui/button";
import { CancelBookingButton } from "./cancel-booking-button";

export type BookingRowData = {
  booking: {
    id: string;
    status: string;
    attendance: string;
    waitlistPosition: number | null;
  };
  session: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    mode: string;
    status: string;
  };
  instructorSlug: string;
  instructorName: string;
  venueName: string | null;
  venueCity: string | null;
  venueMapUrl: string | null;
};

export function BookingRow({
  row,
  timezone,
  showCancel = true,
}: {
  row: BookingRowData;
  timezone: string;
  showCancel?: boolean;
}) {
  const { booking, session } = row;
  const isPast = session.endsAt < new Date();
  const cancelled =
    booking.status === BookingStatus.CANCELLED || session.status === "CANCELLED";
  const canJoin =
    !cancelled &&
    !isPast &&
    session.status !== "COMPLETED" &&
    session.mode !== "OFFLINE" &&
    booking.status === BookingStatus.CONFIRMED &&
    isWithinJoinWindow(session.startsAt, session.endsAt);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:flex-row sm:items-center">
      {/* When */}
      <div className="w-full shrink-0 sm:w-32">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
          {formatDate(session.startsAt, timezone)}
        </p>
        <p className="text-lg font-semibold tabular-nums text-ink">
          {formatTime(session.startsAt, timezone)}
        </p>
      </div>

      {/* What */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/classes/${session.id}`}
            className="font-medium text-ink hover:text-brand-700"
          >
            {session.title}
          </Link>
          {booking.status === BookingStatus.WAITLISTED ? (
            <Badge tone="warning">
              Waitlist{booking.waitlistPosition ? ` #${booking.waitlistPosition}` : ""}
            </Badge>
          ) : null}
          {cancelled ? <Badge tone="soft">Cancelled</Badge> : null}
          {isPast && booking.attendance === "ATTENDED" ? (
            <Badge tone="success">Attended</Badge>
          ) : null}
          {isPast && booking.attendance === "NO_SHOW" ? (
            <Badge tone="soft">Missed</Badge>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <Link href={`/i/${row.instructorSlug}`} className="hover:text-brand-700">
            {row.instructorName}
          </Link>
          {session.mode === "OFFLINE" && row.venueName ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {row.venueName}
              {row.venueCity ? `, ${row.venueCity}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Video className="h-3.5 w-3.5" />
              Online
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {canJoin ? (
          <ButtonLink href={`/live/${session.id}`} size="sm">
            Join live
          </ButtonLink>
        ) : null}
        {row.venueMapUrl && session.mode === "OFFLINE" && !isPast && !cancelled ? (
          <ButtonLink
            href={row.venueMapUrl}
            target="_blank"
            size="sm"
            variant="secondary"
          >
            Directions
          </ButtonLink>
        ) : null}
        {showCancel && !isPast && !cancelled ? (
          <CancelBookingButton
            bookingId={booking.id}
            sessionTitle={session.title}
            startsAt={session.startsAt}
          />
        ) : null}
      </div>
    </div>
  );
}
