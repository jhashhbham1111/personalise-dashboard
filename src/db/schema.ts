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
    invoiceNo: text("invoice_no").notNull().unique(),
    description: text("description").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    method: text("method").notNull().default("UPI"),
    provider: text("provider").notNull().default("mock"),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
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
