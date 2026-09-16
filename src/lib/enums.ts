/**
 * Enum-like value sets.
 *
 * The DB columns are plain strings (SQLite has no enums), so these const objects
 * are the single source of truth for allowed values, and the derived union types
 * give us compile-time checking everywhere in the app.
 */

export const Role = {
  ADMIN: "ADMIN",
  INSTRUCTOR: "INSTRUCTOR",
  STUDENT: "STUDENT",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OfferingType = {
  GROUP_CLASS: "GROUP_CLASS",
  ONE_ON_ONE: "ONE_ON_ONE",
  COURSE: "COURSE",
  WORKSHOP: "WORKSHOP",
} as const;
export type OfferingType = (typeof OfferingType)[keyof typeof OfferingType];

export const ClassMode = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  HYBRID: "HYBRID",
} as const;
export type ClassMode = (typeof ClassMode)[keyof typeof ClassMode];

export const Level = {
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
  ALL_LEVELS: "ALL_LEVELS",
} as const;
export type Level = (typeof Level)[keyof typeof Level];

export const PlanKind = {
  PER_SESSION: "PER_SESSION",
  PACKAGE: "PACKAGE",
  MONTHLY: "MONTHLY",
} as const;
export type PlanKind = (typeof PlanKind)[keyof typeof PlanKind];

export const SessionStatus = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const EnrollmentStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const BookingStatus = {
  CONFIRMED: "CONFIRMED",
  WAITLISTED: "WAITLISTED",
  CANCELLED: "CANCELLED",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const Attendance = {
  PENDING: "PENDING",
  ATTENDED: "ATTENDED",
  NO_SHOW: "NO_SHOW",
} as const;
export type Attendance = (typeof Attendance)[keyof typeof Attendance];

export const PaymentMethod = {
  UPI: "UPI",
  CARD: "CARD",
  NETBANKING: "NETBANKING",
  WALLET: "WALLET",
  OFFLINE: "OFFLINE",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  CREATED: "CREATED",
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const VideoType = {
  VLOG: "VLOG",
  SESSION_RECORDING: "SESSION_RECORDING",
  INTRO: "INTRO",
} as const;
export type VideoType = (typeof VideoType)[keyof typeof VideoType];

export const Visibility = {
  PUBLIC: "PUBLIC",
  ENROLLED_ONLY: "ENROLLED_ONLY",
  PAID: "PAID",
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const PostType = {
  DAILY_UPDATE: "DAILY_UPDATE",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  ARTICLE: "ARTICLE",
} as const;
export type PostType = (typeof PostType)[keyof typeof PostType];

export const ModerationAction = {
  VERIFIED: "VERIFIED",
  UNVERIFIED: "UNVERIFIED",
  SUSPENDED: "SUSPENDED",
  REINSTATED: "REINSTATED",
} as const;
export type ModerationAction =
  (typeof ModerationAction)[keyof typeof ModerationAction];

export const MODERATION_ACTION_LABEL: Record<string, string> = {
  VERIFIED: "Verified",
  UNVERIFIED: "Verification removed",
  SUSPENDED: "Suspended",
  REINSTATED: "Reinstated",
};

export const NotificationType = {
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  WAITLIST_PROMOTED: "WAITLIST_PROMOTED",
  CLASS_REMINDER: "CLASS_REMINDER",
  CLASS_CANCELLED: "CLASS_CANCELLED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  NEW_ENROLLMENT: "NEW_ENROLLMENT",
  NEW_UPDATE: "NEW_UPDATE",
  NEW_MESSAGE: "NEW_MESSAGE",
  NEW_FOLLOWER: "NEW_FOLLOWER",
  GENERAL: "GENERAL",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/* ---------- Display labels ---------- */

export const OFFERING_TYPE_LABEL: Record<string, string> = {
  GROUP_CLASS: "Group class",
  ONE_ON_ONE: "1-on-1",
  COURSE: "Course",
  WORKSHOP: "Workshop",
};

export const MODE_LABEL: Record<string, string> = {
  ONLINE: "Online",
  OFFLINE: "In person",
  HYBRID: "Hybrid",
};

/**
 * The modes an instructor can actually choose.
 *
 * Hybrid is deliberately absent. Nothing in the app ever branched on it —
 * every check is `mode === "ONLINE" ? … : …` — so a Hybrid class behaved
 * exactly like an in-person one (venue required, no join link), while
 * promising students a choice that didn't exist. The value and its label
 * stay in place so any row already saved as Hybrid still renders correctly
 * rather than appearing blank.
 */
export const SELECTABLE_MODES = [ClassMode.ONLINE, ClassMode.OFFLINE] as const;

export const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export const PLAN_KIND_LABEL: Record<string, string> = {
  PER_SESSION: "Per session",
  PACKAGE: "Class pack",
  MONTHLY: "Monthly",
};

export const VISIBILITY_LABEL: Record<string, string> = {
  PUBLIC: "Everyone",
  ENROLLED_ONLY: "Enrolled students",
  PAID: "Paying students",
};

export const POST_TYPE_LABEL: Record<string, string> = {
  DAILY_UPDATE: "Daily update",
  ANNOUNCEMENT: "Announcement",
  ARTICLE: "Article",
};

export const VIDEO_TYPE_LABEL: Record<string, string> = {
  VLOG: "Vlog",
  SESSION_RECORDING: "Class recording",
  INTRO: "Intro",
};

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DISCIPLINES = [
  "Yoga",
  "Meditation",
  "Pilates",
  "Dance",
  "Guitar",
  "Piano",
  "Vocals",
  "Fitness",
  "Martial Arts",
  "Cooking",
  "Painting",
  "Photography",
  "Coding",
  "Languages",
] as const;
