/**
 * Personalise — database schema (Drizzle ORM, SQLite/libSQL).
 *
 * Conventions used throughout:
 *   - Money is always an integer count of **paise**. Never a float.
 *   - Every timestamp is a UTC instant. Local wall-clock time only ever exists
 *     at the edges (a ScheduleRule's timezone + minutes-past-midnight, and
 *     rendering). See src/lib/time.ts.
 *   - "Enum" columns are text; the allowed values live in src/lib/enums.ts and
 *     are enforced by TypeScript at every write site.
 *   - List columns hold JSON arrays, read via parseList() from src/lib/utils.ts.
 *
 * Runs on local SQLite for development and on Turso (libSQL) in production with
 * no schema changes.
 */

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(now)
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ users */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("STUDENT"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    /**
     * Set the moment someone proves they can read mail at the address they
     * signed up with.
     *
     * Null means the account exists but nothing about it is trusted yet — it
     * can hold a session, and nothing else (see requireUser). Signup used to
     * accept any string with an @ in it, which meant a typo'd address locked
     * someone out of their own password reset, and a deliberately fake one
     * gave an instructor a student they could never contact.
     */
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    /**
     * Set when the person asked us to delete their account.
     *
     * The row survives the request because bookings, enrolments and payments
     * reference it, and those are financial and operational records — an
     * instructor's fee ledger and class registers must not develop holes, and
     * payment rows are kept for tax. So the personal fields are scrubbed in
     * place (see src/lib/account-deletion.ts) and this timestamp marks the
     * husk that's left: it can no longer sign in and is not a real person's
     * data any more.
     */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const instructorProfiles = sqliteTable(
  "instructor_profiles",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    headline: text("headline").notNull(),
    bio: text("bio").notNull().default(""),
    disciplines: text("disciplines").notNull().default("[]"),
    languages: text("languages").notNull().default("[]"),
    certifications: text("certifications").notNull().default("[]"),
    city: text("city").notNull().default(""),
    yearsExperience: integer("years_experience").notNull().default(0),
    coverImageUrl: text("cover_image_url"),
    introVideoUrl: text("intro_video_url"),
    instagramUrl: text("instagram_url"),
    youtubeUrl: text("youtube_url"),
    websiteUrl: text("website_url"),
    /**
     * How a student actually hands over the money.
     *
     * While `ONLINE_PAYMENTS=off` the enrol page tells students to pay their
     * instructor directly — and used to stop there, with no UPI ID, no account
     * number, nothing. Someone who had decided to buy had no way to, which is
     * the worst possible place to lose them. These are shown on the enrol page
     * and nowhere else; the QR is generated from `upiId` at render time rather
     * than uploaded, so there's no image handling and no way for the two to
     * disagree.
     */
    upiId: text("upi_id"),
    bankDetails: text("bank_details"),
    paymentNote: text("payment_note"),
    isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
    /**
     * Suspension is an admin decision and outranks the instructor's own
     * isPublished flag: a suspended profile is hidden from the public site and
     * cannot take new bookings, whatever the instructor sets.
     */
    isSuspended: integer("is_suspended", { mode: "boolean" }).notNull().default(false),
    suspendedAt: integer("suspended_at", { mode: "timestamp_ms" }),
    suspendedReason: text("suspended_reason"),
    ratingAvg: integer("rating_avg").notNull().default(0), // rating × 100
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("profiles_city_idx").on(t.city),
    index("profiles_published_idx").on(t.isPublished),
    index("profiles_suspended_idx").on(t.isSuspended),
  ],
);

/**
 * Append-only record of admin decisions about an instructor.
 *
 * Verification and suspension are consequential and contestable — "who
 * suspended this account, when, and why" needs an answer that survives the
 * next state change, which a boolean column alone can't give.
 */
export const moderationEvents = sqliteTable(
  "moderation_events",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    /** Nullable so removing a staff account never erases the audit trail. */
    adminId: text("admin_id").references(() => users.id, { onDelete: "set null" }),
    adminName: text("admin_name").notNull().default(""),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_instructor_idx").on(t.instructorId, t.createdAt)],
);

export const savedInstructors = sqliteTable(
  "saved_instructors",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_unique").on(t.studentId, t.instructorId)],
);

/* ----------------------------------------------------------------- venues */

export const venues = sqliteTable(
  "venues",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull().default(""),
    pincode: text("pincode").notNull().default(""),
    landmark: text("landmark"),
    mapUrl: text("map_url"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("venues_instructor_idx").on(t.instructorId)],
);

/* -------------------------------------------------------------- offerings */

export const offerings = sqliteTable(
  "offerings",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    discipline: text("discipline").notNull().default("Yoga"),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    type: text("type").notNull().default("GROUP_CLASS"),
    mode: text("mode").notNull().default("ONLINE"),
    level: text("level").notNull().default("ALL_LEVELS"),
    durationMin: integer("duration_min").notNull().default(60),
    capacity: integer("capacity").notNull().default(20),
    coverImageUrl: text("cover_image_url"),
    venueId: text("venue_id").references(() => venues.id, { onDelete: "set null" }),
    /**
     * Fewer confirmed students than this and the class auto-cancels shortly
     * before it starts — see `src/lib/underfilled.ts`. Null = no minimum, a
     * class always runs. Doesn't apply to 1-on-1 offerings, whose capacity is
     * already fixed at 1.
     */
    minCapacity: integer("min_capacity"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("offering_slug_unique").on(t.instructorId, t.slug),
    index("offering_discipline_idx").on(t.discipline),
    index("offering_active_idx").on(t.isActive),
  ],
);

export const pricingPlans = sqliteTable(
  "pricing_plans",
  {
    id: id(),
    offeringId: text("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("PER_SESSION"),
    amountPaise: integer("amount_paise").notNull(),
    /** null = unlimited sessions within the validity window */
    sessionsIncluded: integer("sessions_included"),
    validityDays: integer("validity_days"),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("plans_offering_idx").on(t.offeringId)],
);

/* -------------------------------------------------------------- schedules */

export const scheduleRules = sqliteTable(
  "schedule_rules",
  {
    id: id(),
    offeringId: text("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    /** JSON number[] — 0 = Sunday .. 6 = Saturday */
    daysOfWeek: text("days_of_week").notNull().default("[]"),
    /** Minutes past local midnight, e.g. 390 = 06:30 */
    startTimeMinutes: integer("start_time_minutes").notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    endDate: integer("end_date", { mode: "timestamp_ms" }),
    mode: text("mode").notNull().default("ONLINE"),
    venueId: text("venue_id").references(() => venues.id, { onDelete: "set null" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastMaterializedTo: integer("last_materialized_to", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("rules_offering_idx").on(t.offeringId),
    index("rules_instructor_idx").on(t.instructorId),
  ],
);

export const classSessions = sqliteTable(
  "class_sessions",
  {
    id: id(),
    offeringId: text("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    scheduleRuleId: text("schedule_rule_id").references(() => scheduleRules.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    mode: text("mode").notNull().default("ONLINE"),
    venueId: text("venue_id").references(() => venues.id, { onDelete: "set null" }),
    capacity: integer("capacity").notNull().default(20),
    status: text("status").notNull().default("SCHEDULED"),
    roomProvider: text("room_provider"),
    roomName: text("room_name"),
    liveStartedAt: integer("live_started_at", { mode: "timestamp_ms" }),
    liveEndedAt: integer("live_ended_at", { mode: "timestamp_ms" }),
    recordingId: text("recording_id"),
    isRecording: integer("is_recording", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    /**
     * Set once the pre-class reminder has gone out to the instructor and every
     * confirmed student, so a cron that runs every few minutes never sends the
     * same reminder twice. Null means "not reminded yet".
     */
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("session_rule_start_unique").on(t.scheduleRuleId, t.startsAt),
    index("session_instructor_start_idx").on(t.instructorId, t.startsAt),
    index("session_offering_start_idx").on(t.offeringId, t.startsAt),
    index("session_status_start_idx").on(t.status, t.startsAt),
    index("session_reminder_idx").on(t.status, t.remindedAt, t.startsAt),
  ],
);

/* ---------------------------------------------------- enrolment & booking */

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    offeringId: text("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => pricingPlans.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("ACTIVE"),
    /** null = unlimited within the validity window */
    sessionsRemaining: integer("sessions_remaining"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("enrol_student_idx").on(t.studentId, t.status),
    index("enrol_offering_idx").on(t.offeringId),
    index("enrol_instructor_idx").on(t.instructorId),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("CONFIRMED"),
    attendance: text("attendance").notNull().default("PENDING"),
    waitlistPosition: integer("waitlist_position"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }),
    bookedAt: integer("booked_at", { mode: "timestamp_ms" }).notNull().default(now),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("booking_unique").on(t.sessionId, t.studentId),
    index("booking_student_idx").on(t.studentId, t.status),
    index("booking_session_idx").on(t.sessionId, t.status),
  ],
);

/* ----------------------------------------------------------------- money */

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    bookingId: text("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    /**
     * The plan this payment bought, set at checkout time.
     *
     * Before this column existed, `grantEnrollment` recovered the plan by
     * splitting `description` back into "<offering title> — <plan name>" and
     * matching the offering by title — fragile the moment two offerings (from
     * different instructors, or the same one) shared a title. Carrying the id
     * through directly means fulfilment never has to guess. Nullable because
     * older rows and ad-hoc offline payments predate it or never had a saved
     * plan; `grantEnrollment` falls back to the description parse only then.
     */
    planId: text("plan_id").references(() => pricingPlans.id, {
      onDelete: "set null",
    }),
    invoiceNo: text("invoice_no").notNull().unique(),
    description: text("description").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    method: text("method").notNull().default("UPI"),
    provider: text("provider").notNull().default("mock"),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    /** The Dodo/Razorpay hosted checkout page for this order, if the provider is redirect-based. */
    providerCheckoutUrl: text("provider_checkout_url"),
    status: text("status").notNull().default("CREATED"),
    failureReason: text("failure_reason"),
    refundedPaise: integer("refunded_paise").notNull().default(0),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payment_order_unique").on(t.providerOrderId),
    index("payment_student_idx").on(t.studentId, t.status),
    index("payment_instructor_idx").on(t.instructorId, t.status),
    index("payment_created_idx").on(t.createdAt),
  ],
);

/* --------------------------------------------------------------- content */

export const videoAssets = sqliteTable(
  "video_assets",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    offeringId: text("offering_id").references(() => offerings.id, {
      onDelete: "set null",
    }),
    sessionId: text("session_id").references(() => classSessions.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("VLOG"),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    durationSec: integer("duration_sec"),
    visibility: text("visibility").notNull().default("PUBLIC"),
    viewCount: integer("view_count").notNull().default(0),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdAt: createdAt(),
  },
  (t) => [
    index("video_instructor_idx").on(t.instructorId, t.publishedAt),
    index("video_visibility_idx").on(t.visibility),
  ],
);

export const videoLikes = sqliteTable(
  "video_likes",
  {
    id: id(),
    videoId: text("video_id")
      .notNull()
      .references(() => videoAssets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("video_like_unique").on(t.videoId, t.userId)],
);

export const instructorFollows = sqliteTable(
  "instructor_follows",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("instructor_follow_unique").on(t.followerId, t.instructorId),
    index("instructor_follow_instructor_idx").on(t.instructorId),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    coverImageUrl: text("cover_image_url"),
    type: text("type").notNull().default("DAILY_UPDATE"),
    visibility: text("visibility").notNull().default("PUBLIC"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("post_instructor_idx").on(t.instructorId, t.publishedAt)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    offeringId: text("offering_id").references(() => offerings.id, {
      onDelete: "set null",
    }),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("review_unique").on(t.studentId, t.instructorId),
    index("review_instructor_idx").on(t.instructorId),
  ],
);

/**
 * Fixed-window counters for rate limiting (see src/lib/rate-limit.ts).
 *
 * In the database rather than in memory because a per-process counter is
 * meaningless on a host that runs several instances or recycles them between
 * requests.
 */
export const rateLimitHits = sqliteTable(
  "rate_limit_hits",
  {
    id: id(),
    key: text("key").notNull(),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    hits: integer("hits").notNull().default(0),
  },
  (t) => [
    uniqueIndex("rate_limit_window_unique").on(t.key, t.windowStart),
    index("rate_limit_sweep_idx").on(t.windowStart),
  ],
);

/**
 * Redeemable pass codes.
 *
 * The instructor generates a batch, hands one to each student who has paid
 * them, and the student activates their own pass. That removes the per-student
 * manual activation that makes offline money unworkable past a handful of
 * people: the instructor's only job is handing over a code.
 *
 * A code carries its own price and pass terms so it stays valid even if the
 * underlying plan is later edited or retired — a student holding a printed
 * code should always get what they paid for.
 */
export const passCodes = sqliteTable(
  "pass_codes",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    offeringId: text("offering_id")
      .notNull()
      .references(() => offerings.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => pricingPlans.id, {
      onDelete: "set null",
    }),
    /** Uppercase, unambiguous alphabet — see src/lib/pass-codes.ts */
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    /** null = unlimited within the validity window */
    sessionsIncluded: integer("sessions_included"),
    validityDays: integer("validity_days"),
    note: text("note"),
    /** ACTIVE | REDEEMED | REVOKED */
    status: text("status").notNull().default("ACTIVE"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    redeemedBy: text("redeemed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
    enrollmentId: text("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pass_code_instructor_idx").on(t.instructorId, t.status),
    index("pass_code_offering_idx").on(t.offeringId),
  ],
);

/**
 * Single-use password reset tokens.
 *
 * Only the SHA-256 digest is stored, so a leaked database row can't be used to
 * reset anyone's password. Rows are consumed on use and swept once expired.
 */
export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("reset_user_idx").on(t.userId)],
);

/**
 * One-time codes proving control of an email address.
 *
 * Same shape as password_reset_tokens and for the same reason: only the digest
 * of the code is stored, so a leaked database hands an attacker nothing they
 * can type into the form.
 *
 * `attempts` is what makes a 6-digit code safe. A million combinations is not
 * many if you can try them all, so the row is burned after a handful of wrong
 * guesses and a fresh code has to be requested — which is itself rate limited.
 */
export const emailVerificationCodes = sqliteTable(
  "email_verification_codes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The address the code was sent to — a later email change invalidates it. */
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("email_verification_user_idx").on(t.userId)],
);

/**
 * One thread between one instructor and one student.
 *
 * Scoped to a pair, not an offering — a student who takes two of the same
 * instructor's classes has one conversation with them, not two. Only ever
 * created for a pair with an enrolment between them (see src/lib/chat.ts):
 * this is a paid relationship's DM, not an open inbox a stranger can fill
 * with messages.
 *
 * Read state is two timestamps rather than a per-message receipt, because a
 * 1:1 thread only ever needs "has this side read up to when the other side
 * last wrote" — both are bumped to now on that side's own send, so sending a
 * message never marks itself unread for its own sender.
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    lastMessagePreview: text("last_message_preview"),
    instructorReadAt: integer("instructor_read_at", { mode: "timestamp_ms" }),
    studentReadAt: integer("student_read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversation_pair_unique").on(t.instructorId, t.studentId),
    index("conversation_instructor_idx").on(t.instructorId, t.lastMessageAt),
    index("conversation_student_idx").on(t.studentId, t.lastMessageAt),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_message_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("GENERAL"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.readAt)],
);

export const availabilityExceptions = sqliteTable(
  "availability_exceptions",
  {
    id: id(),
    instructorId: text("instructor_id")
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: "cascade" }),
    /** Midnight UTC of the blocked local date */
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exception_unique").on(t.instructorId, t.date)],
);

/* ------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ one, many }) => ({
  instructorProfile: one(instructorProfiles, {
    fields: [users.id],
    references: [instructorProfiles.userId],
  }),
  enrollments: many(enrollments),
  bookings: many(bookings),
  payments: many(payments),
  reviews: many(reviews),
  notifications: many(notifications),
  savedInstructors: many(savedInstructors),
}));

export const instructorProfilesRelations = relations(
  instructorProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [instructorProfiles.userId],
      references: [users.id],
    }),
    venues: many(venues),
    offerings: many(offerings),
    scheduleRules: many(scheduleRules),
    sessions: many(classSessions),
    enrollments: many(enrollments),
    payments: many(payments),
    videos: many(videoAssets),
    posts: many(posts),
    reviews: many(reviews),
    availabilityExceptions: many(availabilityExceptions),
    moderationEvents: many(moderationEvents),
  }),
);

export const moderationEventsRelations = relations(moderationEvents, ({ one }) => ({
  instructor: one(instructorProfiles, {
    fields: [moderationEvents.instructorId],
    references: [instructorProfiles.id],
  }),
  admin: one(users, {
    fields: [moderationEvents.adminId],
    references: [users.id],
  }),
}));

export const venuesRelations = relations(venues, ({ one, many }) => ({
  instructor: one(instructorProfiles, {
    fields: [venues.instructorId],
    references: [instructorProfiles.id],
  }),
  offerings: many(offerings),
  sessions: many(classSessions),
}));

export const offeringsRelations = relations(offerings, ({ one, many }) => ({
  instructor: one(instructorProfiles, {
    fields: [offerings.instructorId],
    references: [instructorProfiles.id],
  }),
  venue: one(venues, { fields: [offerings.venueId], references: [venues.id] }),
  plans: many(pricingPlans),
  scheduleRules: many(scheduleRules),
  sessions: many(classSessions),
  enrollments: many(enrollments),
  videos: many(videoAssets),
  reviews: many(reviews),
}));

export const pricingPlansRelations = relations(pricingPlans, ({ one, many }) => ({
  offering: one(offerings, {
    fields: [pricingPlans.offeringId],
    references: [offerings.id],
  }),
  enrollments: many(enrollments),
}));

export const scheduleRulesRelations = relations(scheduleRules, ({ one, many }) => ({
  offering: one(offerings, {
    fields: [scheduleRules.offeringId],
    references: [offerings.id],
  }),
  instructor: one(instructorProfiles, {
    fields: [scheduleRules.instructorId],
    references: [instructorProfiles.id],
  }),
  venue: one(venues, { fields: [scheduleRules.venueId], references: [venues.id] }),
  sessions: many(classSessions),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  offering: one(offerings, {
    fields: [classSessions.offeringId],
    references: [offerings.id],
  }),
  instructor: one(instructorProfiles, {
    fields: [classSessions.instructorId],
    references: [instructorProfiles.id],
  }),
  scheduleRule: one(scheduleRules, {
    fields: [classSessions.scheduleRuleId],
    references: [scheduleRules.id],
  }),
  venue: one(venues, { fields: [classSessions.venueId], references: [venues.id] }),
  bookings: many(bookings),
  recordings: many(videoAssets),
}));

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  student: one(users, { fields: [enrollments.studentId], references: [users.id] }),
  offering: one(offerings, {
    fields: [enrollments.offeringId],
    references: [offerings.id],
  }),
  instructor: one(instructorProfiles, {
    fields: [enrollments.instructorId],
    references: [instructorProfiles.id],
  }),
  plan: one(pricingPlans, {
    fields: [enrollments.planId],
    references: [pricingPlans.id],
  }),
  bookings: many(bookings),
  payments: many(payments),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  session: one(classSessions, {
    fields: [bookings.sessionId],
    references: [classSessions.id],
  }),
  student: one(users, { fields: [bookings.studentId], references: [users.id] }),
  enrollment: one(enrollments, {
    fields: [bookings.enrollmentId],
    references: [enrollments.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  student: one(users, { fields: [payments.studentId], references: [users.id] }),
  instructor: one(instructorProfiles, {
    fields: [payments.instructorId],
    references: [instructorProfiles.id],
  }),
  enrollment: one(enrollments, {
    fields: [payments.enrollmentId],
    references: [enrollments.id],
  }),
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
  plan: one(pricingPlans, {
    fields: [payments.planId],
    references: [pricingPlans.id],
  }),
}));

export const videoAssetsRelations = relations(videoAssets, ({ one }) => ({
  instructor: one(instructorProfiles, {
    fields: [videoAssets.instructorId],
    references: [instructorProfiles.id],
  }),
  offering: one(offerings, {
    fields: [videoAssets.offeringId],
    references: [offerings.id],
  }),
  session: one(classSessions, {
    fields: [videoAssets.sessionId],
    references: [classSessions.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  instructor: one(instructorProfiles, {
    fields: [posts.instructorId],
    references: [instructorProfiles.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  student: one(users, { fields: [reviews.studentId], references: [users.id] }),
  instructor: one(instructorProfiles, {
    fields: [reviews.instructorId],
    references: [instructorProfiles.id],
  }),
  offering: one(offerings, {
    fields: [reviews.offeringId],
    references: [offerings.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const savedInstructorsRelations = relations(savedInstructors, ({ one }) => ({
  student: one(users, {
    fields: [savedInstructors.studentId],
    references: [users.id],
  }),
  instructor: one(instructorProfiles, {
    fields: [savedInstructors.instructorId],
    references: [instructorProfiles.id],
  }),
}));

export const availabilityExceptionsRelations = relations(
  availabilityExceptions,
  ({ one }) => ({
    instructor: one(instructorProfiles, {
      fields: [availabilityExceptions.instructorId],
      references: [instructorProfiles.id],
    }),
  }),
);

export const passCodesRelations = relations(passCodes, ({ one }) => ({
  instructor: one(instructorProfiles, {
    fields: [passCodes.instructorId],
    references: [instructorProfiles.id],
  }),
  offering: one(offerings, {
    fields: [passCodes.offeringId],
    references: [offerings.id],
  }),
  plan: one(pricingPlans, {
    fields: [passCodes.planId],
    references: [pricingPlans.id],
  }),
  redeemer: one(users, {
    fields: [passCodes.redeemedBy],
    references: [users.id],
  }),
  enrollment: one(enrollments, {
    fields: [passCodes.enrollmentId],
    references: [enrollments.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const emailVerificationCodesRelations = relations(
  emailVerificationCodes,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationCodes.userId],
      references: [users.id],
    }),
  }),
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  instructor: one(instructorProfiles, {
    fields: [conversations.instructorId],
    references: [instructorProfiles.id],
  }),
  student: one(users, {
    fields: [conversations.studentId],
    references: [users.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [chatMessages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));

/* ------------------------------------------------------------ row types */

export type User = typeof users.$inferSelect;
export type InstructorProfile = typeof instructorProfiles.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Offering = typeof offerings.$inferSelect;
export type PricingPlan = typeof pricingPlans.$inferSelect;
export type ScheduleRule = typeof scheduleRules.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type VideoAsset = typeof videoAssets.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ModerationEvent = typeof moderationEvents.$inferSelect;
export type PassCode = typeof passCodes.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
