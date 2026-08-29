import "server-only";

import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { bookings, classSessions, db, instructorProfiles, offerings } from "@/db";
import { BookingStatus, SessionStatus } from "./enums";
import { cancelClassSession } from "./booking";

/**
 * Auto-cancels classes that won't reach their offering's minimum headcount.
 *
 * An instructor sets `offerings.minCapacity` (null = no minimum, the default
 * — nothing changes for anyone who doesn't opt in). Shortly before a class
 * with a minimum is due to start, if it still hasn't reached that headcount,
 * this cancels it through the exact same path an instructor's own "cancel
 * this class" button uses (`cancelClassSession`) — so every booked student's
 * credit goes back onto their pass automatically, and everyone (students and
 * the instructor) is emailed, without the instructor having to notice and
 * act in time.
 *
 * The cutoff is fixed for now — 2 hours before start — rather than
 * per-offering, to keep the first version simple. A class is only ever
 * cancelled once: its status leaves SCHEDULED on the first run that catches
 * it, so calling this on a tight schedule (every 15–30 min) is safe.
 */
const CUTOFF_HOURS_BEFORE_START = 2;

export async function cancelUnderfilledSessions(): Promise<{
  cancelled: number;
  checked: number;
}> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + CUTOFF_HOURS_BEFORE_START * 60 * 60 * 1000);

  const confirmedCount = sql<number>`(
    select count(*) from ${bookings}
    where ${bookings.sessionId} = ${classSessions.id}
      and ${bookings.status} = ${BookingStatus.CONFIRMED}
  )`.as("booked");

  const candidates = await db
    .select({
      sessionId: classSessions.id,
      minCapacity: offerings.minCapacity,
      booked: confirmedCount,
      instructorUserId: instructorProfiles.userId,
    })
    .from(classSessions)
    .innerJoin(offerings, eq(offerings.id, classSessions.offeringId))
    .innerJoin(instructorProfiles, eq(instructorProfiles.id, classSessions.instructorId))
    .where(
      and(
        eq(classSessions.status, SessionStatus.SCHEDULED),
        isNotNull(offerings.minCapacity),
        gte(classSessions.startsAt, now),
        lt(classSessions.startsAt, cutoff),
      ),
    );

  let cancelled = 0;
  for (const c of candidates) {
    const min = c.minCapacity;
    if (min === null || Number(c.booked) >= min) continue;

    const result = await cancelClassSession({
      sessionId: c.sessionId,
      reason: `This class needed at least ${min} student${min === 1 ? "" : "s"} to run and only had ${c.booked}. You've been credited back automatically — book another session whenever suits you.`,
      notifyInstructorUserId: c.instructorUserId,
    });
    if (result.ok) cancelled++;
  }

  return { cancelled, checked: candidates.length };
}
