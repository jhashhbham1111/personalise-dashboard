import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Clock, MapPin, Users, Video } from "lucide-react";

import { bookings, classSessions, db, users } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { isWithinJoinWindow } from "@/lib/booking-policy";
import { BookingStatus, MODE_LABEL, SessionStatus } from "@/lib/enums";
import {
  formatDateRange,
  formatDuration,
  formatLongDate,
  formatRelative,
} from "@/lib/time";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, PageHeader, StatTile } from "@/components/ui/page";
import { Roster } from "./roster";
import { CancelSessionButton } from "./cancel-session-button";
import { RenameSessionButton } from "./rename-session-button";

export const metadata: Metadata = { title: "Class roster" };

export default async function SessionRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireInstructor();

  const session = await db.query.classSessions.findFirst({
    where: and(
      eq(classSessions.id, id),
      eq(classSessions.instructorId, user.instructorProfileId),
    ),
    with: { offering: true, venue: true },
  });
  if (!session) notFound();

  const roster = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      attendance: bookings.attendance,
      waitlistPosition: bookings.waitlistPosition,
      bookedAt: bookings.bookedAt,
      studentId: users.id,
      studentName: users.name,
      studentEmail: users.email,
      studentPhone: users.phone,
      studentAvatar: users.avatarUrl,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.studentId))
    .where(eq(bookings.sessionId, id))
    .orderBy(asc(bookings.waitlistPosition), asc(bookings.bookedAt));

  const confirmed = roster.filter((r) => r.status === BookingStatus.CONFIRMED);
  const waitlisted = roster.filter((r) => r.status === BookingStatus.WAITLISTED);
  const cancelled = roster.filter((r) => r.status === BookingStatus.CANCELLED);

  const isPast = session.endsAt < new Date();
  const isCancelled = session.status === SessionStatus.CANCELLED;
  const isCompleted = session.status === SessionStatus.COMPLETED;
  const canJoinLive =
    !isCancelled &&
    !isCompleted &&
    session.mode !== "OFFLINE" &&
    isWithinJoinWindow(session.startsAt, session.endsAt);

  const attended = confirmed.filter((r) => r.attendance === "ATTENDED").length;

  return (
    <div className="max-w-3xl space-y-6">
      <nav className="text-sm text-ink-soft">
        <Link href="/studio/schedule" className="hover:text-brand-700">
          Schedule
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <span className="truncate">{session.title}</span>
      </nav>

      <PageHeader
        title={session.title}
        description={formatLongDate(session.startsAt, user.timezone)}
        actions={
          <div className="flex gap-2">
            {canJoinLive ? (
              <ButtonLink href={`/live/${session.id}`}>Start the class</ButtonLink>
            ) : null}
            {!isCancelled ? (
              <RenameSessionButton sessionId={session.id} title={session.title} />
            ) : null}
            {!isPast && !isCancelled ? (
              <CancelSessionButton
                sessionId={session.id}
                title={session.title}
                studentCount={confirmed.length}
              />
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusBadge status={session.status} />
        <Badge tone={session.mode === "ONLINE" ? "info" : "warning"}>
          {session.mode === "ONLINE" ? (
            <Video className="h-3 w-3" />
          ) : (
            <MapPin className="h-3 w-3" />
          )}
          {MODE_LABEL[session.mode]}
        </Badge>
        <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
          <Clock className="h-4 w-4" />
          {formatDateRange(session.startsAt, session.endsAt, user.timezone)} ·{" "}
          {formatDuration(
            Math.round(
              (session.endsAt.getTime() - session.startsAt.getTime()) / 60000,
            ),
          )}
        </span>
      </div>

      {isCancelled ? (
        <Alert tone="danger">
          <strong>This class is cancelled.</strong>{" "}
          {session.cancelReason ?? "Everyone booked has been notified."}
        </Alert>
      ) : null}

      {session.venue ? (
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Venue
          </p>
          <p className="mt-1 font-medium text-ink">{session.venue.name}</p>
          <p className="text-sm text-ink-soft">
            {session.venue.addressLine}, {session.venue.city}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Booked"
          value={`${confirmed.length}/${session.capacity}`}
          tone={confirmed.length >= session.capacity ? "accent" : "brand"}
        />
        <StatTile label="Waitlist" value={waitlisted.length} />
        <StatTile
          label={isPast ? "Attended" : "Seats left"}
          value={isPast ? attended : Math.max(0, session.capacity - confirmed.length)}
        />
      </div>

      {/* -------------------------------------------------------- register */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-ink-faint" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Register
          </h2>
        </div>

        {confirmed.length === 0 ? (
          <Card className="p-5 text-sm text-ink-soft">
            Nobody has booked this class yet.
          </Card>
        ) : (
          <Roster
            sessionId={session.id}
            students={confirmed.map((r) => ({
              bookingId: r.bookingId,
              name: r.studentName,
              email: r.studentEmail,
              phone: r.studentPhone,
              avatarUrl: r.studentAvatar,
              attendance: r.attendance,
            }))}
            allowRemoval={!isPast && !isCancelled}
          />
        )}
      </section>

      {/* -------------------------------------------------------- waitlist */}
      {waitlisted.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Waitlist
          </h2>
          <Card className="divide-y divide-line">
            {waitlisted.map((r) => (
              <div key={r.bookingId} className="flex items-center gap-3 p-3.5">
                <Badge tone="warning">#{r.waitlistPosition ?? "—"}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.studentName}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {r.studentEmail}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-faint">
                  joined {formatRelative(r.bookedAt)}
                </span>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-ink-faint">
            If someone cancels, the person at the top is moved into the seat and
            emailed automatically.
          </p>
        </section>
      ) : null}

      {cancelled.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-soft hover:text-ink">
            {cancelled.length} cancelled booking
            {cancelled.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-faint">
            {cancelled.map((r) => (
              <li key={r.bookingId}>{r.studentName}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
