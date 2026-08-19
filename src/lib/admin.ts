import "server-only";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import {
  classSessions,
  db,
  enrollments,
  instructorProfiles,
  moderationEvents,
  payments,
  users,
} from "@/db";
import { env } from "./env";
import {
  EnrollmentStatus,
  ModerationAction,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "./enums";
import { notify } from "./notify";

/* --------------------------------------------------------------- overview */

export async function platformStats() {
  const [[students], [instructors], [suspended], [unverified], [sessions], [money]] =
    await Promise.all([
      db.select({ n: count() }).from(users).where(eq(users.role, Role.STUDENT)),
      db.select({ n: count() }).from(instructorProfiles),
      db
        .select({ n: count() })
        .from(instructorProfiles)
        .where(eq(instructorProfiles.isSuspended, true)),
      db
        .select({ n: count() })
        .from(instructorProfiles)
        .where(eq(instructorProfiles.isVerified, false)),
      db.select({ n: count() }).from(classSessions),
      db
        .select({
          gross: sql<number>`coalesce(sum(case when ${payments.status} = ${PaymentStatus.PAID} then ${payments.amountPaise} else 0 end), 0)`,
          online: sql<number>`coalesce(sum(case when ${payments.status} = ${PaymentStatus.PAID} and ${payments.method} != ${PaymentMethod.OFFLINE} then ${payments.amountPaise} else 0 end), 0)`,
        })
        .from(payments),
    ]);

  const online = Number(money?.online ?? 0);

  return {
    students: students?.n ?? 0,
    instructors: instructors?.n ?? 0,
    suspended: suspended?.n ?? 0,
    unverified: unverified?.n ?? 0,
    sessions: sessions?.n ?? 0,
    grossPaise: Number(money?.gross ?? 0),
    onlinePaise: online,
    platformFeePaise: feeOn(online),
  };
}

/* ------------------------------------------------------------ instructors */

export type AdminInstructor = Awaited<ReturnType<typeof listInstructorsForAdmin>>[number];

/**
 * Every instructor, suspended and unverified first — the admin's job here is
 * the exceptions, so the list is ordered by what needs a decision rather than
 * alphabetically.
 */
export async function listInstructorsForAdmin() {
  return db
    .select({
      id: instructorProfiles.id,
      slug: instructorProfiles.slug,
      city: instructorProfiles.city,
      headline: instructorProfiles.headline,
      isVerified: instructorProfiles.isVerified,
      isPublished: instructorProfiles.isPublished,
      isSuspended: instructorProfiles.isSuspended,
      suspendedReason: instructorProfiles.suspendedReason,
      suspendedAt: instructorProfiles.suspendedAt,
      verifiedAt: instructorProfiles.verifiedAt,
      createdAt: instructorProfiles.createdAt,
      ratingAvg: instructorProfiles.ratingAvg,
      ratingCount: instructorProfiles.ratingCount,
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      activeStudents: db.$count(
        enrollments,
        and(
          eq(enrollments.instructorId, instructorProfiles.id),
          eq(enrollments.status, EnrollmentStatus.ACTIVE),
        ),
      ),
    })
    .from(instructorProfiles)
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .orderBy(
      desc(instructorProfiles.isSuspended),
      instructorProfiles.isVerified,
      desc(instructorProfiles.createdAt),
    );
}

export async function recentModerationEvents(limit = 20) {
  return db
    .select({
      id: moderationEvents.id,
      action: moderationEvents.action,
      note: moderationEvents.note,
      adminName: moderationEvents.adminName,
      createdAt: moderationEvents.createdAt,
      instructorName: users.name,
      instructorSlug: instructorProfiles.slug,
    })
    .from(moderationEvents)
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, moderationEvents.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .orderBy(desc(moderationEvents.createdAt))
    .limit(limit);
}

/* --------------------------------------------------------------- actions */

async function logModeration(args: {
  instructorId: string;
  admin: { id: string; name: string };
  action: ModerationAction;
  note?: string | null;
}) {
  await db.insert(moderationEvents).values({
    instructorId: args.instructorId,
    adminId: args.admin.id,
    adminName: args.admin.name,
    action: args.action,
    note: args.note ?? null,
  });
}

/** Look up an instructor plus the user account behind it. */
export async function getInstructorForAdmin(instructorId: string) {
  const [row] = await db
    .select({
      profile: instructorProfiles,
      userId: users.id,
      name: users.name,
    })
    .from(instructorProfiles)
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(eq(instructorProfiles.id, instructorId))
    .limit(1);
  return row ?? null;
}

export async function setVerified(args: {
  instructorId: string;
  verified: boolean;
  admin: { id: string; name: string };
}) {
  const target = await getInstructorForAdmin(args.instructorId);
  if (!target) return { ok: false as const, error: "Instructor not found." };

  await db
    .update(instructorProfiles)
    .set({
      isVerified: args.verified,
      verifiedAt: args.verified ? new Date() : null,
    })
    .where(eq(instructorProfiles.id, args.instructorId));

  await logModeration({
    instructorId: args.instructorId,
    admin: args.admin,
    action: args.verified ? ModerationAction.VERIFIED : ModerationAction.UNVERIFIED,
  });

  await notify({
    userId: target.userId,
    type: NotificationType.GENERAL,
    title: args.verified ? "Your account is verified" : "Verification removed",
    body: args.verified
      ? "The verified badge now shows on your public page and in search results."
      : "The verified badge has been removed from your profile. Get in touch if you think this is a mistake.",
    link: "/studio/profile",
    email: true,
  });

  return { ok: true as const };
}

/**
 * Suspending hides the instructor from the public site and stops new bookings.
 * It deliberately does *not* cancel existing bookings or refund passes — those
 * are decisions with money attached that an admin should make explicitly, one
 * class at a time, rather than have a single button do irreversibly.
 */
export async function setSuspended(args: {
  instructorId: string;
  suspended: boolean;
  reason?: string;
  admin: { id: string; name: string };
}) {
  const target = await getInstructorForAdmin(args.instructorId);
  if (!target) return { ok: false as const, error: "Instructor not found." };

  if (args.suspended && !args.reason?.trim()) {
    return { ok: false as const, error: "Give a reason — the instructor is told what it is." };
  }

  await db
    .update(instructorProfiles)
    .set({
      isSuspended: args.suspended,
      suspendedAt: args.suspended ? new Date() : null,
      suspendedReason: args.suspended ? args.reason!.trim() : null,
    })
    .where(eq(instructorProfiles.id, args.instructorId));

  await logModeration({
    instructorId: args.instructorId,
    admin: args.admin,
    action: args.suspended ? ModerationAction.SUSPENDED : ModerationAction.REINSTATED,
    note: args.suspended ? args.reason!.trim() : null,
  });

  await notify({
    userId: target.userId,
    type: NotificationType.GENERAL,
    title: args.suspended ? "Your account has been suspended" : "Your account is active again",
    body: args.suspended
      ? `Your public page is hidden and new bookings are paused. Reason given: ${args.reason!.trim()}`
      : "Your public page is visible again and students can book your classes.",
    link: "/studio",
    email: true,
  });

  const upcoming = args.suspended
    ? await db
        .select({ n: count() })
        .from(classSessions)
        .where(
          and(
            eq(classSessions.instructorId, args.instructorId),
            gte(classSessions.startsAt, new Date()),
          ),
        )
    : [];

  return {
    ok: true as const,
    upcomingSessions: Number(upcoming[0]?.n ?? 0),
  };
}

/* --------------------------------------------------------------- payouts */

export function feeOn(amountPaise: number): number {
  return Math.round((amountPaise * env.platformFeePercent) / 100);
}

export type PayoutRow = {
  instructorId: string;
  name: string;
  email: string;
  slug: string;
  isSuspended: boolean;
  onlinePaise: number;
  offlinePaise: number;
  pendingPaise: number;
  paymentCount: number;
  feePaise: number;
  netPaise: number;
};

/**
 * What each instructor is owed for a period.
 *
 * Only online payments count toward a payout — cash recorded as OFFLINE went
 * straight into the instructor's hand and was never the platform's to pass on.
 * It's still shown, because an instructor looking at their own fees page sees
 * both and would otherwise think the numbers disagree.
 */
export async function payoutReport(since?: Date): Promise<PayoutRow[]> {
  const paid = eq(payments.status, PaymentStatus.PAID);
  const isOffline = sql`${payments.method} = ${PaymentMethod.OFFLINE}`;

  const rows = await db
    .select({
      instructorId: instructorProfiles.id,
      name: users.name,
      email: users.email,
      slug: instructorProfiles.slug,
      isSuspended: instructorProfiles.isSuspended,
      onlinePaise: sql<number>`coalesce(sum(case when ${paid} and not ${isOffline} then ${payments.amountPaise} else 0 end), 0)`,
      offlinePaise: sql<number>`coalesce(sum(case when ${paid} and ${isOffline} then ${payments.amountPaise} else 0 end), 0)`,
      pendingPaise: sql<number>`coalesce(sum(case when ${payments.status} in (${PaymentStatus.PENDING}, ${PaymentStatus.CREATED}) then ${payments.amountPaise} else 0 end), 0)`,
      paymentCount: sql<number>`sum(case when ${paid} then 1 else 0 end)`,
    })
    .from(instructorProfiles)
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .leftJoin(
      payments,
      since
        ? and(
            eq(payments.instructorId, instructorProfiles.id),
            gte(payments.createdAt, since),
          )
        : eq(payments.instructorId, instructorProfiles.id),
    )
    .groupBy(instructorProfiles.id)
    .orderBy(desc(sql`coalesce(sum(case when ${paid} and not ${isOffline} then ${payments.amountPaise} else 0 end), 0)`));

  return rows.map((r) => {
    const online = Number(r.onlinePaise);
    const fee = feeOn(online);
    return {
      instructorId: r.instructorId,
      name: r.name,
      email: r.email,
      slug: r.slug,
      isSuspended: r.isSuspended,
      onlinePaise: online,
      offlinePaise: Number(r.offlinePaise),
      pendingPaise: Number(r.pendingPaise),
      paymentCount: Number(r.paymentCount ?? 0),
      feePaise: fee,
      netPaise: online - fee,
    };
  });
}
