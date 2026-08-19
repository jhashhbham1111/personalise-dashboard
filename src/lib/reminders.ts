import "server-only";

import { and, eq, gt, isNull, lte } from "drizzle-orm";

import { bookings, classSessions, db } from "@/db";
import { BookingStatus, NotificationType, SessionStatus } from "@/lib/enums";
import { notify } from "@/lib/notify";
import { formatDateRange } from "@/lib/time";

/** How far ahead of a class's start time its reminder goes out. */
export const REMINDER_LEAD_MINUTES = 60;

/**
 * Finds every SCHEDULED class starting within the next `leadMinutes` that
 * hasn't been reminded yet, and notifies the instructor and every confirmed
 * student.
 *
 * Safe to call as often as you like (e.g. every 5-15 minutes from a cron) —
 * `remindedAt` is set the moment a session's reminder goes out, so a session
 * is never reminded twice. A session whose window already passed (the cron
 * didn't run in time, or it was cancelled) is simply skipped rather than
 * reminded late: the query only matches sessions that haven't started yet.
 */
export async function sendClassReminders(
  leadMinutes: number = REMINDER_LEAD_MINUTES,
): Promise<{
  sessionsReminded: number;
  instructorsNotified: number;
  studentsNotified: number;
}> {
  const now = new Date();
  const horizon = new Date(now.getTime() + leadMinutes * 60_000);

  const due = await db.query.classSessions.findMany({
    where: and(
      eq(classSessions.status, SessionStatus.SCHEDULED),
      isNull(classSessions.remindedAt),
      gt(classSessions.startsAt, now),
      lte(classSessions.startsAt, horizon),
    ),
    with: {
      instructor: { columns: { userId: true } },
      venue: { columns: { name: true, city: true } },
      bookings: {
        where: eq(bookings.status, BookingStatus.CONFIRMED),
        columns: { studentId: true },
      },
    },
  });

  let instructorsNotified = 0;
  let studentsNotified = 0;

  for (const session of due) {
    const when = formatDateRange(session.startsAt, session.endsAt);
    const whereNote =
      session.mode === "OFFLINE"
        ? session.venue
          ? ` at ${session.venue.name}, ${session.venue.city}.`
          : "."
        : " — the join button opens 15 minutes before start.";

    const roster = session.bookings.length;
    await notify({
      userId: session.instructor.userId,
      type: NotificationType.CLASS_REMINDER,
      title: `Starting soon: ${session.title}`,
      body: `${roster} student${roster === 1 ? "" : "s"} booked. ${when}${whereNote}`,
      link: `/studio/sessions/${session.id}`,
      email: true,
    });
    instructorsNotified += 1;

    for (const booking of session.bookings) {
      await notify({
        userId: booking.studentId,
        type: NotificationType.CLASS_REMINDER,
        title: `${session.title} starts soon`,
        body: `${when}${whereNote}`,
        link: "/dashboard/bookings",
        email: true,
      });
      studentsNotified += 1;
    }

    // Mark reminded last and per-session, so a crash partway through this
    // loop just leaves the remaining sessions to be picked up (and their
    // instructor/students notified) on the cron's next run, instead of
    // silently losing reminders for the whole batch.
    await db
      .update(classSessions)
      .set({ remindedAt: new Date() })
      .where(eq(classSessions.id, session.id));
  }

  return { sessionsReminded: due.length, instructorsNotified, studentsNotified };
}
