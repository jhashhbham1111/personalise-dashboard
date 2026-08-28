import "server-only";

import { and, count, eq, gt, gte, isNull, ne, or, sql } from "drizzle-orm";

import {
  bookings,
  classSessions,
  db,
  enrollments,
  instructorProfiles,
  users,
} from "@/db";
import { cancelBooking } from "./booking";
import { BookingStatus, EnrollmentStatus, Role } from "./enums";
import { pluralize } from "./utils";

/**
 * Account deletion — "anonymise and retain", not DROP ROW.
 *
 * Google Play requires an in-app way to delete an account (Settings) and a
 * public page describing it (/account/delete). What it does not require is
 * that the row disappears, and it must not: bookings, enrolments and payments
 * all point at the user, an instructor's fee ledger and class registers must
 * not develop holes, and payment records are kept for tax. So the personal
 * fields on the row are overwritten with placeholders, `deletedAt` is stamped,
 * and everything that identified a person is gone while the ledger still adds
 * up.
 *
 * The public page must keep describing whatever this file actually does — if
 * the retained set changes here, change the page too.
 */

/** Name shown wherever a deleted person's row is still joined to — a register, a ledger row. */
export const DELETED_NAME = "Deleted account";

/**
 * Placeholder address. `.invalid` is reserved by RFC 2606 and can never
 * resolve, so nothing we send can reach a real inbox by accident, and the
 * user id keeps it unique — `users.email` carries a unique constraint, so a
 * shared placeholder would make the second deletion on the platform fail.
 */
export function deletedEmailFor(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

/**
 * A hash no password can ever match.
 *
 * bcrypt.compare() against a string that isn't a valid bcrypt digest returns
 * false rather than throwing (verified against bcryptjs), including for an
 * empty candidate password — so this closes the door on its own. The
 * `deletedAt` check in loginAction is the second lock, not the only one.
 */
export const DELETED_PASSWORD_HASH = "";

export type DeletionOutcome =
  | { ok: true; cancelledBookings: number }
  | { ok: false; error: string };

/**
 * Enrolments that still entitle a student to something from this instructor.
 *
 * Same definition of "usable pass" as enrolledOfferingIds() in queries.ts:
 * ACTIVE, inside its validity window, and with credit left — the three things
 * bookSession() checks before it will seat anyone. Counting merely-ACTIVE rows
 * instead would trap an instructor forever behind a class pack that ran out of
 * credits but has no expiry date, since nothing ever moves such a row to
 * EXPIRED.
 */
async function activeStudentCount(instructorProfileId: string): Promise<number> {
  const now = new Date();
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${enrollments.studentId})` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.instructorId, instructorProfileId),
        eq(enrollments.status, EnrollmentStatus.ACTIVE),
        or(isNull(enrollments.expiresAt), gte(enrollments.expiresAt, now))!,
        // null = unlimited, so only a zero-or-below number disqualifies.
        or(isNull(enrollments.sessionsRemaining), gt(enrollments.sessionsRemaining, 0))!,
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Why an instructor can't delete yet, or null if they can.
 *
 * An instructor with students mid-term must not be able to vanish: those
 * students have paid for classes that are still owed to them, and an account
 * that anonymises itself takes the only contact route with it. The way out is
 * theirs to take, so the message names it step by step rather than saying no.
 */
export async function instructorDeletionBlock(
  instructorProfileId: string,
): Promise<string | null> {
  const students = await activeStudentCount(instructorProfileId);
  if (students === 0) return null;

  return (
    `${pluralize(students, "student")} still ${students === 1 ? "holds" : "hold"} an active pass with you, ` +
    "so this account can't be deleted yet. Hide your page in Studio → My profile so nobody new can enrol, " +
    "then either let the current passes run out or void them in Studio → Fees — refunding anyone who's owed money. " +
    "Come back here once no active passes are left."
  );
}

/**
 * Anonymise an account at its owner's request.
 *
 * Caller must have already established that `userId` is the signed-in user;
 * this function does no authorization of its own.
 */
export async function deleteAccount(userId: string): Promise<DeletionOutcome> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.deletedAt) return { ok: false, error: "This account is already deleted." };

  const profile = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.userId, userId),
  });

  // Admins are excluded deliberately: an admin deleting themselves through the
  // student settings page would leave the platform with one fewer moderator
  // and no warning that it happened. Staff accounts are removed by another
  // admin, out of band.
  if (user.role === Role.ADMIN) {
    return {
      ok: false,
      error:
        "Staff accounts can't be deleted from here — ask another admin to remove yours.",
    };
  }

  if (profile) {
    const blocked = await instructorDeletionBlock(profile.id);
    if (blocked) return { ok: false, error: blocked };
  }

  // Future bookings go through cancelBooking() rather than a bulk UPDATE so
  // the seat is genuinely released: it refunds the credit where the policy
  // says it should and promotes whoever is first on the waitlist. A raw
  // status write would leave classes looking full with a ghost in the seat.
  // Done before the scrub, while the address on the row is still the one its
  // owner reads, so the cancellation notices land somewhere useful.
  const upcoming = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
    .where(
      and(
        eq(bookings.studentId, userId),
        ne(bookings.status, BookingStatus.CANCELLED),
        gte(classSessions.startsAt, new Date()),
      ),
    );

  let cancelledBookings = 0;
  for (const b of upcoming) {
    const result = await cancelBooking({ bookingId: b.id, asStudentId: userId });
    if (result.ok) cancelledBookings++;
  }

  // Closes the public-visibility gate from instructor-visibility.ts on both
  // switches the instructor can't later flip back: isPublished is theirs, but
  // isSuspended outranks it, and every listing query composes
  // publiclyVisibleInstructor. Without this the page, its classes and its
  // enrol buttons keep serving to a marketplace whose teacher is gone.
  if (profile) {
    await db
      .update(instructorProfiles)
      .set({
        isPublished: false,
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedReason: "Account deleted at the owner's request.",
      })
      .where(eq(instructorProfiles.id, profile.id));
  }

  await db
    .update(users)
    .set({
      name: DELETED_NAME,
      email: deletedEmailFor(userId),
      phone: null,
      avatarUrl: null,
      passwordHash: DELETED_PASSWORD_HASH,
      deletedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { ok: true, cancelledBookings };
}

/** Upcoming bookings the person would lose, so the confirm dialog can say how many. */
export async function upcomingBookingCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
    .where(
      and(
        eq(bookings.studentId, userId),
        ne(bookings.status, BookingStatus.CANCELLED),
        gte(classSessions.startsAt, new Date()),
      ),
    );
  return Number(row?.n ?? 0);
}
