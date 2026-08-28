import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  bookings,
  classSessions,
  db,
  enrollments,
  instructorProfiles,
  offerings,
  posts,
  pricingPlans,
  reviews,
  users,
  venues,
  videoAssets,
} from "@/db";
import { BookingStatus, EnrollmentStatus, SessionStatus, Visibility } from "./enums";
import { canonicalCity, cityKey } from "./utils";

/**
 * Read queries shared across pages.
 *
 * Kept in one place mostly so the seat-count joins stay consistent — a class
 * that says "3 seats left" on the directory and "full" on its own page is the
 * kind of bug that erodes trust in a booking product.
 */

export type InstructorCardData = Awaited<
  ReturnType<typeof listInstructors>
>[number];

/**
 * Who the public is allowed to see.
 *
 * An admin suspension outranks the instructor's own publish switch, and
 * verification gates both — every public listing query composes this rather
 * than re-deriving it, which is what stops an unverified or suspended
 * instructor leaking through one page that forgot to check.
 *
 * The page-level half of this rule lives in `src/lib/instructor-visibility.ts`
 * (`instructorIsPublic`); the two must be kept in step.
 */
export const publiclyVisibleInstructor = and(
  eq(instructorProfiles.isPublished, true),
  eq(instructorProfiles.isSuspended, false),
  eq(instructorProfiles.isVerified, true),
)!;

export async function listInstructors(filters?: {
  discipline?: string;
  city?: string;
  q?: string;
}) {
  const conditions = [publiclyVisibleInstructor];

  if (filters?.discipline) {
    conditions.push(like(instructorProfiles.disciplines, `%"${filters.discipline}"%`));
  }
  if (filters?.city) {
    // Compared case-insensitively rather than with eq(): cities are normalised
    // on write now, but rows saved before that still hold "delhi" alongside
    // "Delhi", and a filter that silently omits half a city is worse than a
    // slightly slower comparison.
    conditions.push(sql`lower(${instructorProfiles.city}) = ${cityKey(filters.city)}`);
  }
  if (filters?.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        like(users.name, term),
        like(instructorProfiles.headline, term),
        like(instructorProfiles.disciplines, term),
      )!,
    );
  }

  return db
    .select({
      id: instructorProfiles.id,
      slug: instructorProfiles.slug,
      name: users.name,
      avatarUrl: users.avatarUrl,
      headline: instructorProfiles.headline,
      disciplines: instructorProfiles.disciplines,
      city: instructorProfiles.city,
      yearsExperience: instructorProfiles.yearsExperience,
      isVerified: instructorProfiles.isVerified,
      ratingAvg: instructorProfiles.ratingAvg,
      ratingCount: instructorProfiles.ratingCount,
    })
    .from(instructorProfiles)
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(instructorProfiles.ratingAvg), asc(users.name));
}

/**
 * Collapses rows that differ only by case or spacing into one option, keeping
 * the tidiest spelling of each. SELECT DISTINCT alone returned "Delhi" and
 * "delhi" as two entries that each filtered to a different half of the city.
 */
function dedupeCities(values: (string | null)[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = cityKey(trimmed);
    const canonical = canonicalCity(trimmed);
    // Prefer the already-canonical spelling if any row has it, so the dropdown
    // shows "Delhi" rather than whichever row happened to be read first.
    if (!byKey.has(key) || trimmed === canonical) byKey.set(key, canonical);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Which classes this student holds a *usable* pass for.
 *
 * One query per page rather than one per card — the listing pages use it to
 * label each card's button with what will actually happen when it's tapped.
 *
 * "Usable" deliberately matches what `bookSession` will accept: ACTIVE alone
 * isn't enough, since an expired pass and one with no credits left are both
 * still ACTIVE. Labelling those cards "Book" produces a button that fails on
 * click, which is exactly the thing these labels exist to prevent.
 */
export async function enrolledOfferingIds(
  studentId: string,
): Promise<Set<string>> {
  const now = new Date();
  const rows = await db
    .selectDistinct({ offeringId: enrollments.offeringId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.status, EnrollmentStatus.ACTIVE),
        or(
          isNull(enrollments.expiresAt),
          gte(enrollments.expiresAt, now),
        )!,
        // null = unlimited, so only a zero-or-below number disqualifies.
        or(
          isNull(enrollments.sessionsRemaining),
          gt(enrollments.sessionsRemaining, 0),
        )!,
      ),
    );
  return new Set(rows.map((r) => r.offeringId));
}

/** Distinct cities that currently have a published instructor. */
export async function instructorCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: instructorProfiles.city })
    .from(instructorProfiles)
    .where(publiclyVisibleInstructor);
  return dedupeCities(rows.map((r) => r.city));
}

/**
 * Cities to offer on the class directory: where classes are actually held.
 *
 * Instructor cities alone left every venue city out of the dropdown, so an
 * in-person class could be held in a city nobody could filter for.
 */
export async function classCities(): Promise<string[]> {
  const [instructorRows, venueRows] = await Promise.all([
    db
      .selectDistinct({ city: instructorProfiles.city })
      .from(instructorProfiles)
      .where(publiclyVisibleInstructor),
    db
      .selectDistinct({ city: venues.city })
      .from(venues)
      .innerJoin(
        instructorProfiles,
        eq(instructorProfiles.id, venues.instructorId),
      )
      .where(and(publiclyVisibleInstructor, eq(venues.isActive, true))),
  ]);

  return dedupeCities([
    ...instructorRows.map((r) => r.city),
    ...venueRows.map((r) => r.city),
  ]);
}

export async function getInstructorBySlug(slug: string) {
  const [row] = await db
    .select({
      profile: instructorProfiles,
      user: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(instructorProfiles)
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(eq(instructorProfiles.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function instructorOfferings(instructorId: string) {
  const rows = await db.query.offerings.findMany({
    where: and(
      eq(offerings.instructorId, instructorId),
      eq(offerings.isActive, true),
    ),
    with: {
      plans: {
        where: eq(pricingPlans.isActive, true),
        orderBy: [asc(pricingPlans.sortOrder)],
      },
      venue: true,
    },
    orderBy: [asc(offerings.createdAt)],
  });
  return rows;
}

export type UpcomingSession = Awaited<
  ReturnType<typeof listUpcomingSessions>
>[number];

/**
 * Upcoming classes with seat counts folded in.
 *
 * The seat count is a correlated subquery rather than a join + group-by so a
 * class with zero bookings still comes back (and comes back as 0, not missing).
 */
export async function listUpcomingSessions(filters?: {
  instructorId?: string;
  offeringId?: string;
  mode?: string;
  discipline?: string;
  city?: string;
  limit?: number;
  from?: Date;
  to?: Date;
}) {
  const bookedCount = sql<number>`(
    select count(*) from ${bookings}
    where ${bookings.sessionId} = ${classSessions.id}
      and ${bookings.status} = ${BookingStatus.CONFIRMED}
  )`.as("booked_count");

  const conditions = [
    eq(classSessions.status, SessionStatus.SCHEDULED),
    filters?.from ? gte(classSessions.startsAt, filters.from) : gte(classSessions.endsAt, new Date()),
    // Every caller of this is a public page, so a class is only listed if its
    // instructor is publicly visible — otherwise a hidden or suspended
    // instructor's classes stay bookable through the class directory.
    publiclyVisibleInstructor,
  ];
  if (filters?.to) conditions.push(lte(classSessions.startsAt, filters.to));
  if (filters?.instructorId)
    conditions.push(eq(classSessions.instructorId, filters.instructorId));
  if (filters?.offeringId)
    conditions.push(eq(classSessions.offeringId, filters.offeringId));
  if (filters?.mode) conditions.push(eq(classSessions.mode, filters.mode));
  if (filters?.discipline)
    conditions.push(eq(offerings.discipline, filters.discipline));
  if (filters?.city) {
    // A class's city is where it actually happens — its venue — falling back to
    // the instructor's city for online classes, which have no venue. Matching
    // only the instructor's city (as this did) hid every in-person class held
    // somewhere other than where its instructor is based: a Delhi venue taught
    // by a Bengaluru-based instructor was invisible under city=Delhi, while
    // simultaneously appearing under city=Bengaluru with a Delhi address on
    // the card.
    conditions.push(
      sql`lower(coalesce(nullif(${venues.city}, ''), ${instructorProfiles.city})) = ${cityKey(filters.city)}`,
    );
  }

  return db
    .select({
      id: classSessions.id,
      title: classSessions.title,
      startsAt: classSessions.startsAt,
      endsAt: classSessions.endsAt,
      mode: classSessions.mode,
      capacity: classSessions.capacity,
      status: classSessions.status,
      offeringId: offerings.id,
      offeringSlug: offerings.slug,
      discipline: offerings.discipline,
      level: offerings.level,
      instructorId: instructorProfiles.id,
      instructorSlug: instructorProfiles.slug,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
      instructorCity: instructorProfiles.city,
      venueName: venues.name,
      venueCity: venues.city,
      venueAddress: venues.addressLine,
      booked: bookedCount,
    })
    .from(classSessions)
    .innerJoin(offerings, eq(offerings.id, classSessions.offeringId))
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, classSessions.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .leftJoin(venues, eq(venues.id, classSessions.venueId))
    .where(and(...conditions))
    .orderBy(asc(classSessions.startsAt))
    .limit(filters?.limit ?? 60);
}

export async function getSessionDetail(sessionId: string) {
  const [row] = await db
    .select({
      session: classSessions,
      offering: offerings,
      instructor: instructorProfiles,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
      instructorUserId: users.id,
      venue: venues,
    })
    .from(classSessions)
    .innerJoin(offerings, eq(offerings.id, classSessions.offeringId))
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, classSessions.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .leftJoin(venues, eq(venues.id, classSessions.venueId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

/**
 * Videos a given viewer is allowed to see.
 *
 * PUBLIC is open to everyone; ENROLLED_ONLY and PAID require an active
 * enrolment with that instructor. Gating happens in the query, not in the
 * template, so a URL guess can't leak a recording.
 */
export async function listVideos(opts: {
  instructorId?: string;
  viewerId?: string | null;
  limit?: number;
}) {
  let enrolledInstructorIds: string[] = [];
  if (opts.viewerId) {
    const rows = await db
      .selectDistinct({ instructorId: enrollments.instructorId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, opts.viewerId),
          eq(enrollments.status, EnrollmentStatus.ACTIVE),
        ),
      );
    enrolledInstructorIds = rows.map((r) => r.instructorId);
  }

  const visibilityCondition =
    enrolledInstructorIds.length > 0
      ? or(
          eq(videoAssets.visibility, Visibility.PUBLIC),
          inArray(videoAssets.instructorId, enrolledInstructorIds),
        )!
      : eq(videoAssets.visibility, Visibility.PUBLIC);

  const conditions = [visibilityCondition, publiclyVisibleInstructor];
  if (opts.instructorId)
    conditions.push(eq(videoAssets.instructorId, opts.instructorId));

  return db
    .select({
      id: videoAssets.id,
      title: videoAssets.title,
      description: videoAssets.description,
      type: videoAssets.type,
      url: videoAssets.url,
      thumbnailUrl: videoAssets.thumbnailUrl,
      durationSec: videoAssets.durationSec,
      visibility: videoAssets.visibility,
      viewCount: videoAssets.viewCount,
      publishedAt: videoAssets.publishedAt,
      instructorId: instructorProfiles.id,
      instructorSlug: instructorProfiles.slug,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
    })
    .from(videoAssets)
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, videoAssets.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(videoAssets.publishedAt))
    .limit(opts.limit ?? 40);
}

export async function listPosts(instructorId: string, limit = 12) {
  return db.query.posts.findMany({
    where: eq(posts.instructorId, instructorId),
    orderBy: [desc(posts.publishedAt)],
    limit,
  });
}

export async function listReviews(instructorId: string, limit = 10) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      studentName: users.name,
      studentAvatar: users.avatarUrl,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.studentId))
    .where(eq(reviews.instructorId, instructorId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/** Active enrolments for a student, with offering and instructor attached. */
export async function studentEnrollments(studentId: string) {
  return db.query.enrollments.findMany({
    where: eq(enrollments.studentId, studentId),
    with: {
      offering: { with: { venue: true } },
      plan: true,
      instructor: { with: { user: { columns: { name: true, avatarUrl: true } } } },
    },
    orderBy: [desc(enrollments.createdAt)],
  });
}

export async function studentBookings(
  studentId: string,
  opts?: { upcoming?: boolean; limit?: number },
) {
  const rows = await db
    .select({
      booking: bookings,
      session: classSessions,
      offering: {
        id: offerings.id,
        title: offerings.title,
        slug: offerings.slug,
        discipline: offerings.discipline,
      },
      instructorSlug: instructorProfiles.slug,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
      instructorId: instructorProfiles.id,
      venueName: venues.name,
      venueAddress: venues.addressLine,
      venueCity: venues.city,
      venueMapUrl: venues.mapUrl,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(classSessions.id, bookings.sessionId))
    .innerJoin(offerings, eq(offerings.id, classSessions.offeringId))
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, classSessions.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .leftJoin(venues, eq(venues.id, classSessions.venueId))
    .where(
      and(
        eq(bookings.studentId, studentId),
        opts?.upcoming === true
          ? gte(classSessions.endsAt, new Date())
          : opts?.upcoming === false
            ? lte(classSessions.endsAt, new Date())
            : undefined,
      ),
    )
    .orderBy(
      opts?.upcoming === false
        ? desc(classSessions.startsAt)
        : asc(classSessions.startsAt),
    )
    .limit(opts?.limit ?? 100);

  return rows;
}

/** Headline numbers for the instructor's studio overview. */
export async function instructorStats(instructorId: string) {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [activeStudents] = await db
    .select({ n: sql<number>`count(distinct ${enrollments.studentId})` })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.instructorId, instructorId),
        eq(enrollments.status, EnrollmentStatus.ACTIVE),
      ),
    );

  const [upcoming] = await db
    .select({ n: count() })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.instructorId, instructorId),
        eq(classSessions.status, SessionStatus.SCHEDULED),
        gte(classSessions.startsAt, now),
      ),
    );

  const [revenue] = await db
    .select({
      total: sql<number>`coalesce(sum(case when status = 'PAID' then amount_paise else 0 end), 0)`,
      pending: sql<number>`coalesce(sum(case when status in ('PENDING','CREATED') then amount_paise else 0 end), 0)`,
    })
    .from(sql`payments`)
    .where(sql`instructor_id = ${instructorId}`);

  const [monthRevenue] = await db
    .select({
      total: sql<number>`coalesce(sum(amount_paise), 0)`,
    })
    .from(sql`payments`)
    .where(
      sql`instructor_id = ${instructorId} and status = 'PAID' and paid_at >= ${monthStart.getTime()}`,
    );

  return {
    activeStudents: activeStudents?.n ?? 0,
    upcomingSessions: upcoming?.n ?? 0,
    revenuePaise: Number(revenue?.total ?? 0),
    pendingPaise: Number(revenue?.pending ?? 0),
    monthRevenuePaise: Number(monthRevenue?.total ?? 0),
  };
}

export async function studentReviewedInstructors(studentId: string): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ instructorId: reviews.instructorId })
    .from(reviews)
    .where(eq(reviews.studentId, studentId));
  return new Set(rows.map((r) => r.instructorId));
}
