"use server";

import { and, avg, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, bookings, instructorProfiles, reviews } from "@/db";
import { BookingStatus } from "@/lib/enums";
import { requireUser } from "@/lib/auth";
import { ActionState, fail, ok } from "@/lib/actions";

/**
 * Submit a star rating + comment for an instructor.
 *
 * Rules:
 * - The student must have at least one CONFIRMED booking that has already ended
 *   (attendance check is intentionally lenient — marking attendance relies on
 *   the instructor remembering, and penalising the student for that would
 *   suppress legitimate feedback).
 * - One review per (student, instructor) pair. Calling again updates it.
 * - Rating must be 1–5.
 *
 * After saving, ratingAvg and ratingCount on the instructor profile are
 * recalculated from all reviews (not incremental) to stay consistent.
 */
export async function submitReviewAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const instructorId = form.get("instructorId")?.toString() ?? "";
  const rating = Number(form.get("rating") ?? 0);
  const comment = (form.get("comment")?.toString() ?? "").trim();

  if (!instructorId) return fail("Missing instructor.");
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return fail("Pick a rating between 1 and 5 stars.");
  }

  // Verify the student actually attended a session with this instructor.
  const attended = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.studentId, user.id),
      eq(bookings.status, BookingStatus.CONFIRMED),
    ),
    with: {
      session: {
        columns: { instructorId: true, endsAt: true },
      },
    },
  });

  // A session that hasn't ended yet doesn't count.
  const validAttendance =
    attended?.session?.instructorId === instructorId &&
    attended.session.endsAt < new Date();

  if (!validAttendance) {
    return fail("You can only review a class after you've attended it.");
  }

  // Upsert — one review per (student, instructor). If they reviewed before,
  // this overwrites it with the new rating and comment.
  await db
    .insert(reviews)
    .values({
      studentId: user.id,
      instructorId,
      rating,
      comment,
    })
    .onConflictDoUpdate({
      target: [reviews.studentId, reviews.instructorId],
      set: { rating, comment },
    });

  // Recalculate the instructor's aggregate from all reviews so it stays
  // consistent even if the student is editing an existing review.
  const [stats] = await db
    .select({
      avgRating: avg(reviews.rating),
      cnt: count(),
    })
    .from(reviews)
    .where(eq(reviews.instructorId, instructorId));

  await db
    .update(instructorProfiles)
    .set({
      ratingAvg: Math.round(Number(stats?.avgRating ?? 0) * 100),
      ratingCount: stats?.cnt ?? 0,
    })
    .where(eq(instructorProfiles.id, instructorId));

  revalidatePath("/dashboard/bookings");

  return ok("Thank you — your review has been published.");
}
