import Link from "next/link";
import { MapPin, Users, Video } from "lucide-react";

import type { UpcomingSession } from "@/lib/queries";
import { LEVEL_LABEL, MODE_LABEL } from "@/lib/enums";
import { formatDate, formatDuration, formatTime } from "@/lib/time";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { ButtonLink } from "./ui/button";
import { Card } from "./ui/card";

/**
 * One upcoming class. Used on the landing page, the class directory and each
 * instructor's public page, so seat counts read identically everywhere.
 */
export function SessionCard({
  session,
  timezone,
  showInstructor = true,
}: {
  session: UpcomingSession;
  timezone: string;
  showInstructor?: boolean;
}) {
  const seatsLeft = Math.max(0, session.capacity - Number(session.booked));
  const isFull = seatsLeft === 0;
  const durationMin = Math.round(
    (session.endsAt.getTime() - session.startsAt.getTime()) / 60000,
  );
  const isOnline = session.mode === "ONLINE";

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
              {formatDate(session.startsAt, timezone)}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {formatTime(session.startsAt, timezone)}
            </p>
          </div>
          <Badge tone={isOnline ? "info" : "warning"}>
            {isOnline ? (
              <Video className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {MODE_LABEL[session.mode]}
          </Badge>
        </div>

        <h3 className="mt-3 font-semibold leading-snug text-ink">
          {session.title}
        </h3>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span>{formatDuration(durationMin)}</span>
          <span>{LEVEL_LABEL[session.level] ?? session.level}</span>
          <span>{session.discipline}</span>
        </div>

        {session.venueName ? (
          <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-ink-soft">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {session.venueName}
              <span className="block text-ink-faint">{session.venueCity}</span>
            </span>
          </p>
        ) : null}

        {showInstructor ? (
          <Link
            href={`/i/${session.instructorSlug}`}
            className="mt-3 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-brand-700"
          >
            <Avatar
              name={session.instructorName}
              src={session.instructorAvatar}
              size="sm"
            />
            {session.instructorName}
          </Link>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span
            className={
              isFull
                ? "inline-flex items-center gap-1.5 text-xs font-medium text-accent-700"
                : "inline-flex items-center gap-1.5 text-xs text-ink-soft"
            }
          >
            <Users className="h-3.5 w-3.5" />
            {isFull
              ? "Full — join waitlist"
              : `${seatsLeft} of ${session.capacity} seats left`}
          </span>

          <ButtonLink
            href={`/classes/${session.id}`}
            size="sm"
            variant={isFull ? "secondary" : "primary"}
          >
            {isFull ? "Waitlist" : "Book"}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
