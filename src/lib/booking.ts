import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { bookings, classSessions, db, enrollments, instructorProfiles } from "@/db";
import {
  Attendance,
  BookingStatus,
  EnrollmentStatus,
  NotificationType,
  SessionStatus,
} from "./enums";
import { notify } from "./notify";
import { canCancelFree, FREE_CANCELLATION_HOURS } from "./booking-policy";

export { canCancelFree, FREE_CANCELLATION_HOURS };
import { formatDateRange } from "./time";

/**
 * Booking rules live here rather than in route handlers, so the same capacity,
 * waitlist and cancellation logic applies no matter what triggers it — a student
 * booking, an instructor adding someone manually, or a seat opening up.
 */

export type BookingOutcome =
  | {
      ok: true;
      bookingId: string;
      status: "CONFIRMED" | "WAITLISTED";
      waitlistPosition?: number;
    }
  | { ok: false; error: string };

async function confirmedCount(sessionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(
      and(eq(bookings.sessionId, sessionId), eq(bookings.status, BookingStatus.CONFIRMED)),
    );
  return row?.n ?? 0;
}

/**
 * Place a student in a class.
 *
 * Consumes one credit from an active enrolment when the plan is credit-based.
 * If the class is full the student is waitlisted instead — and no credit is
 * spent until they're actually promoted into a seat.
 */
export async function bookSession(args: {
  studentId: string;
  sessionId: string;
  /** Skips the enrolment requirement — used after a successful per-session payment. */
  allowWithoutEnrollment?: boolean;
}): Promise<BookingOutcome> {
  const session = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, args.sessionId),
  });
  if (!session) return { ok: false, error: "That class no longer exists." };
  if (session.status === SessionStatus.CANCELLED)
    return { ok: false, error: "That class has been cancelled." };
  if (session.status === SessionStatus.COMPLETED || session.endsAt < new Date())
    return { ok: false, error: "That class has already finished." };

  // A suspended instructor takes no new bookings, even from someone holding a
  // pass or working from a page that was already open when the suspension
  // landed. Checked here rather than in the page so every caller is covered.
  const instructor = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, session.instructorId),
    columns: { isSuspended: true },
  });
  if (instructor?.isSuspended)
    return { ok: false, error: "This class isn't taking bookings right now." };

  const existing = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.sessionId, args.sessionId),
      eq(bookings.studentId, args.studentId),
    ),
  });
  if (existing && existing.status !== BookingStatus.CANCELLED) {
    return { ok: false, error: "You're already booked into this class." };
  }

  const enrollment = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, args.studentId),
      eq(enrollments.offeringId, session.offeringId),
      eq(enrollments.status, EnrollmentStatus.ACTIVE),
    ),
    orderBy: [desc(enrollments.createdAt)],
  });

  if (!enrollment && !args.allowWithoutEnrollment) {
    return { ok: false, error: "Enrol in this class before booking a session." };
  }
  if (enrollment?.expiresAt && enrollment.expiresAt < new Date()) {
    await db
      .update(enrollments)
      .set({ status: EnrollmentStatus.EXPIRED })
      .where(eq(enrollments.id, enrollment.id));
    return { ok: false, error: "Your pass has expired. Renew it to keep booking." };
  }

  const creditBased = enrollment != null && enrollment.sessionsRemaining !== null;
  if (creditBased && (enrollment!.sessionsRemaining ?? 0) <= 0) {
    return { ok: false, error: "No sessions left on your pass. Top up to book more." };
  }

  // Everything above is a precondition check. Everything below has to survive
  // two people pressing Book at the same instant, so each write carries its own
  // condition and we act on whether it actually changed a row. Reading the seat
  // count and then inserting is not safe here: the gap between them is several
  // network round trips, and a 20-seat class will happily take 25 bookings.
  const bookingId = existing?.id ?? crypto.randomUUID();
  const now = Date.now();
  const enrollmentId = enrollment?.id ?? null;

  const claim = existing
    ? await db.run(sql`
        UPDATE bookings
           SET status = ${BookingStatus.CONFIRMED},
               enrollment_id = ${enrollmentId},
               attendance = ${Attendance.PENDING},
               waitlist_position = NULL,
               booked_at = ${now},
               cancelled_at = NULL
         WHERE id = ${bookingId}
           AND (SELECT COUNT(*) FROM bookings b
                 WHERE b.session_id = ${args.sessionId}
                   AND b.status = ${BookingStatus.CONFIRMED}) < ${session.capacity}
      `)
    : await db.run(sql`
        INSERT INTO bookings
          (id, session_id, student_id, enrollment_id, status, attendance,
           waitlist_position, booked_at, cancelled_at)
        SELECT ${bookingId}, ${args.sessionId}, ${args.studentId}, ${enrollmentId},
               ${BookingStatus.CONFIRMED}, ${Attendance.PENDING}, NULL, ${now}, NULL
         WHERE (SELECT COUNT(*) FROM bookings b
                 WHERE b.session_id = ${args.sessionId}
                   AND b.status = ${BookingStatus.CONFIRMED}) < ${session.capacity}
      `);

  const gotSeat = claim.rowsAffected > 0;

  if (gotSeat) {
    // Credits are only ever spent on a real seat. The guard means two
    // simultaneous bookings can't both spend the last credit and leave the
    // balance at -1.
    if (creditBased) {
      const spend = await db.run(sql`
        UPDATE enrollments
           SET sessions_remaining = sessions_remaining - 1
         WHERE id = ${enrollment!.id}
           AND sessions_remaining > 0
      `);
      if (spend.rowsAffected === 0) {
        // Lost a race for the final credit. Give the seat straight back rather
        // than letting them into a class they haven't paid for.
        await db
          .update(bookings)
          .set({ status: BookingStatus.CANCELLED, cancelledAt: new Date() })
          .where(eq(bookings.id, bookingId));
        return {
          ok: false,
          error: "No sessions left on your pass. Top up to book more.",
        };
      }
    }
  } else {
    // The class filled up between the checks above and this write. Waitlist
    // instead, computing the position inside the statement so two people
    // joining at once can't be handed the same number.
    if (existing) {
      await db.run(sql`
        UPDATE bookings
           SET status = ${BookingStatus.WAITLISTED},
               enrollment_id = ${enrollmentId},
               attendance = ${Attendance.PENDING},
               waitlist_position = (SELECT COUNT(*) FROM bookings b
                                     WHERE b.session_id = ${args.sessionId}
                                       AND b.status = ${BookingStatus.WAITLISTED}) + 1,
               booked_at = ${now},
               cancelled_at = NULL
         WHERE id = ${bookingId}
      `);
    } else {
      await db.run(sql`
        INSERT INTO bookings
          (id, session_id, student_id, enrollment_id, status, attendance,
           waitlist_position, booked_at, cancelled_at)
        SELECT ${bookingId}, ${args.sessionId}, ${args.studentId}, ${enrollmentId},
               ${BookingStatus.WAITLISTED}, ${Attendance.PENDING},
               (SELECT COUNT(*) FROM bookings b
                 WHERE b.session_id = ${args.sessionId}
                   AND b.status = ${BookingStatus.WAITLISTED}) + 1,
               ${now}, NULL
      `);
    }
  }

  const isFull = !gotSeat;
  const waitlistPosition = isFull
    ? ((
        await db.query.bookings.findFirst({
          where: eq(bookings.id, bookingId),
          columns: { waitlistPosition: true },
        })
      )?.waitlistPosition ?? undefined)
    : undefined;

  await notify({
    userId: args.studentId,
    type: isFull ? NotificationType.GENERAL : NotificationType.BOOKING_CONFIRMED,
    title: isFull ? `Waitlisted for ${session.title}` : `Booked: ${session.title}`,
    body: isFull
      ? `You're #${waitlistPosition} on the waitlist for ${formatDateRange(session.startsAt, session.endsAt)}. We'll tell you the moment a seat opens.`
      : `See you on ${formatDateRange(session.startsAt, session.endsAt)}.`,
    link: "/dashboard/bookings",
    email: true,
  });

  return {
    ok: true,
    bookingId,
    status: isFull ? "WAITLISTED" : "CONFIRMED",
    waitlistPosition,
  };
}

/**
 * Cancel a booking and, if a seat opened up, promote whoever is first in line.
 *
 * Cancelling inside the free window returns the credit; after it, the credit is
 * forfeited — the instructor has already reserved that time. Instructors
 * cancelling on a student's behalf never incur the penalty.
 *
 * **Authorization is required, not optional.** Exactly one of `asStudentId`
 * (the student cancelling their own booking) or `asSessionId` (an instructor
 * removing someone from a class they have already been shown to own) must be
 * supplied, and it is checked against the booking here. A booking id is a
 * bearer token otherwise: this used to take only `bookingId`, so any signed-in
 * user could cancel any stranger's class by posting a different id.
 */
export async function cancelBooking(
  args: { bookingId: string; byInstructor?: boolean } & (
    | { asStudentId: string; asSessionId?: never }
    | { asSessionId: string; asStudentId?: never }
  ),
): Promise<{ ok: true; refundedCredit: boolean } | { ok: false; error: string }> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, args.bookingId),
    with: {
      session: {
        columns: { id: true, title: true, startsAt: true, endsAt: true },
      },
      enrollment: { columns: { id: true, sessionsRemaining: true } },
    },
  });
  if (!booking) return { ok: false, error: "Booking not found." };

  // Deliberately the same message as "not found" — a stranger probing ids
  // shouldn't learn which of them are real.
  if (args.asStudentId && booking.studentId !== args.asStudentId) {
    return { ok: false, error: "Booking not found." };
  }
  if (args.asSessionId && booking.sessionId !== args.asSessionId) {
    return { ok: false, error: "Booking not found." };
  }

  if (booking.status === BookingStatus.CANCELLED)
    return { ok: false, error: "That booking is already cancelled." };

  const wasConfirmed = booking.status === BookingStatus.CONFIRMED;
  const refundCredit = Boolean(
    wasConfirmed &&
      booking.enrollment &&
      booking.enrollment.sessionsRemaining !== null &&
      (args.byInstructor || canCancelFree(booking.session.startsAt)),
  );

  // Conditional on the booking not already being cancelled, so a double-click
  // (or a retried request) can't refund the same credit twice.
  const cancelled = await db.run(sql`
    UPDATE bookings
       SET status = ${BookingStatus.CANCELLED},
           cancelled_at = ${Date.now()},
           waitlist_position = NULL
     WHERE id = ${booking.id}
       AND status <> ${BookingStatus.CANCELLED}
  `);
  if (cancelled.rowsAffected === 0) {
    return { ok: false, error: "That booking is already cancelled." };
  }

  if (refundCredit && booking.enrollment) {
    await db
      .update(enrollments)
      .set({ sessionsRemaining: sql`${enrollments.sessionsRemaining} + 1` })
      .where(eq(enrollments.id, booking.enrollment.id));
  }

  await notify({
    userId: booking.studentId,
    type: NotificationType.BOOKING_CANCELLED,
    title: `Cancelled: ${booking.session.title}`,
    body: refundCredit
      ? "Your booking was cancelled and the session credit is back on your pass."
      : "Your booking was cancelled.",
    link: "/dashboard/bookings",
    email: true,
  });

  if (wasConfirmed) await promoteFromWaitlist(booking.sessionId);

  return { ok: true, refundedCredit: refundCredit };
}

/**
 * Cancel an entire session: flips it to CANCELLED, cancels every booking on
 * it via `cancelBooking({ byInstructor: true })` — which is what actually
 * returns each student's credit to their pass — and emails every affected
 * student. Callers are responsible for authorization before calling this;
 * it does no ownership check of its own, the same posture `cancelBooking`
 * takes with `asSessionId`/`asStudentId`.
 *
 * Used by both the instructor's own "cancel this class" action and the
 * automatic underfilled-class job (`src/lib/underfilled.ts`) — one place
 * decides what "cancelling a class" means, so a system-initiated
 * cancellation returns credit exactly the way an instructor-initiated one
 * always has.
 */
export async function cancelClassSession(args: {
  sessionId: string;
  reason: string;
  /** Set only for a cancellation the instructor didn't personally trigger, so they're told too — not just their students. */
  notifyInstructorUserId?: string;
}): Promise<{ ok: true; studentsNotified: number } | { ok: false; error: string }> {
  const session = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, args.sessionId),
    with: { bookings: true },
  });
  if (!session) return { ok: false, error: "That class no longer exists." };
  if (session.status === SessionStatus.CANCELLED) {
    return { ok: false, error: "That class is already cancelled." };
  }

  await db
    .update(classSessions)
    .set({ status: SessionStatus.CANCELLED, cancelReason: args.reason })
    .where(eq(classSessions.id, args.sessionId));

  let released = 0;
  for (const b of session.bookings) {
    if (b.status === BookingStatus.CANCELLED) continue;
    await cancelBooking({ bookingId: b.id, byInstructor: true, asSessionId: args.sessionId });
    released++;
    await notify({
      userId: b.studentId,
      type: NotificationType.CLASS_CANCELLED,
      title: `Class cancelled: ${session.title}`,
      body: args.reason,
      link: "/dashboard/bookings",
      email: true,
    });
  }

  if (args.notifyInstructorUserId) {
    await notify({
      userId: args.notifyInstructorUserId,
      type: NotificationType.CLASS_CANCELLED,
      title: `Auto-cancelled: ${session.title}`,
      body: args.reason,
      link: `/studio/sessions/${session.id}`,
    });
  }

  return { ok: true, studentsNotified: released };
}

/** Move the longest-waiting student into a freed seat, if there's room. */
export async function promoteFromWaitlist(sessionId: string): Promise<boolean> {
  const session = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
  });
  if (!session || session.status !== SessionStatus.SCHEDULED) return false;

  const taken = await confirmedCount(sessionId);
  if (taken >= session.capacity) return false;

  const next = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.sessionId, sessionId),
      eq(bookings.status, BookingStatus.WAITLISTED),
    ),
    orderBy: [asc(bookings.waitlistPosition), asc(bookings.bookedAt)],
    with: { enrollment: { columns: { id: true, sessionsRemaining: true } } },
  });
  if (!next) return false;

  // Two cancellations landing together would otherwise both see one free seat
  // and promote two people into it. The capacity condition rides along with
  // the write, and losing the race simply means no promotion happened.
  const promoted = await db.run(sql`
    UPDATE bookings
       SET status = ${BookingStatus.CONFIRMED},
           waitlist_position = NULL
     WHERE id = ${next.id}
       AND status = ${BookingStatus.WAITLISTED}
       AND (SELECT COUNT(*) FROM bookings b
             WHERE b.session_id = ${sessionId}
               AND b.status = ${BookingStatus.CONFIRMED}) < ${session.capacity}
  `);
  if (promoted.rowsAffected === 0) return false;

  if (next.enrollment && next.enrollment.sessionsRemaining !== null) {
    const spend = await db.run(sql`
      UPDATE enrollments
         SET sessions_remaining = sessions_remaining - 1
       WHERE id = ${next.enrollment.id}
         AND sessions_remaining > 0
    `);
    if (spend.rowsAffected === 0) {
      // Their pass ran dry while they waited. Put them back on the waitlist
      // rather than seating someone who can't pay for it, and let the next
      // person in line have the seat.
      await db.run(sql`
        UPDATE bookings
           SET status = ${BookingStatus.WAITLISTED},
               waitlist_position = (SELECT COUNT(*) FROM bookings b
                                     WHERE b.session_id = ${sessionId}
                                       AND b.status = ${BookingStatus.WAITLISTED}) + 1
         WHERE id = ${next.id}
      `);
      return false;
    }
  }

  // Everyone still waiting moves up one place — one statement rather than one
  // round trip per person, which on a long waitlist was the slowest part of
  // every cancellation.
  await db.run(sql`
    UPDATE bookings
       SET waitlist_position = waitlist_position - 1
     WHERE session_id = ${sessionId}
       AND status = ${BookingStatus.WAITLISTED}
       AND waitlist_position > ${next.waitlistPosition ?? 0}
  `);

  await notify({
    userId: next.studentId,
    type: NotificationType.WAITLIST_PROMOTED,
    title: `A seat opened up: ${session.title}`,
    body: `You're off the waitlist and confirmed for ${formatDateRange(session.startsAt, session.endsAt)}.`,
    link: "/dashboard/bookings",
    email: true,
  });

  return true;
}

/** Seats taken / seats left, for the booking UI. */
export async function sessionAvailability(sessionId: string) {
  const session = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    columns: { capacity: true },
  });
  if (!session) return { capacity: 0, booked: 0, seatsLeft: 0, isFull: true };
  const booked = await confirmedCount(sessionId);
  return {
    capacity: session.capacity,
    booked,
    seatsLeft: Math.max(0, session.capacity - booked),
    isFull: booked >= session.capacity,
  };
}

/** Seat counts for many sessions at once — avoids N+1 on listing pages. */
export async function bulkAvailability(
  sessionIds: string[],
): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await db
    .select({ sessionId: bookings.sessionId, n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, BookingStatus.CONFIRMED),
        sql`${bookings.sessionId} in ${sessionIds}`,
      ),
    )
    .groupBy(bookings.sessionId);
  return new Map(rows.map((r) => [r.sessionId, r.n]));
}
