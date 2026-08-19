import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import {
  ArrowRight,
  CalendarPlus,
  Megaphone,
  Users,
  Video,
} from "lucide-react";

import {
  bookings,
  classSessions,
  db,
  enrollments,
  instructorProfiles,
  offerings,
  users,
} from "@/db";
import { requireInstructor } from "@/lib/auth";
import { instructorStats } from "@/lib/queries";
import { BookingStatus, SessionStatus } from "@/lib/enums";
import { addDays, formatDateRange, formatRelative } from "@/lib/time";
import { formatMoney, parseList } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, SectionTitle, StatTile } from "@/components/ui/page";

export const metadata: Metadata = { title: "Teaching studio" };

export default async function StudioPage() {
  const user = await requireInstructor();
  const now = new Date();

  const profile = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, user.instructorProfileId),
  });

  const [stats, upcoming, recentEnrolments, offeringCount] = await Promise.all([
    instructorStats(user.instructorProfileId),

    // Next week of classes, with a live seat count on each.
    db
      .select({
        id: classSessions.id,
        title: classSessions.title,
        startsAt: classSessions.startsAt,
        endsAt: classSessions.endsAt,
        mode: classSessions.mode,
        capacity: classSessions.capacity,
        booked: db.$count(
          bookings,
          and(
            eq(bookings.sessionId, classSessions.id),
            eq(bookings.status, BookingStatus.CONFIRMED),
          ),
        ),
      })
      .from(classSessions)
      .where(
        and(
          eq(classSessions.instructorId, user.instructorProfileId),
          eq(classSessions.status, SessionStatus.SCHEDULED),
          gte(classSessions.startsAt, now),
          lte(classSessions.startsAt, addDays(now, 7)),
        ),
      )
      .orderBy(asc(classSessions.startsAt))
      .limit(6),

    db
      .select({
        id: enrollments.id,
        createdAt: enrollments.createdAt,
        studentName: users.name,
        studentAvatar: users.avatarUrl,
        offeringTitle: offerings.title,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
      .where(eq(enrollments.instructorId, user.instructorProfileId))
      .orderBy(desc(enrollments.createdAt))
      .limit(5),

    db
      .select({ n: count() })
      .from(offerings)
      .where(
        and(
          eq(offerings.instructorId, user.instructorProfileId),
          eq(offerings.isActive, true),
        ),
      ),
  ]);

  const hasClasses = (offeringCount[0]?.n ?? 0) > 0;
  const isPublished = profile?.isPublished ?? false;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={
          upcoming.length > 0
            ? `Your next class is ${formatRelative(upcoming[0].startsAt)}.`
            : "Nothing on the calendar for the next week."
        }
        actions={
          <ButtonLink href="/studio/schedule">
            <CalendarPlus className="h-4 w-4" />
            Add a class time
          </ButtonLink>
        }
      />

      {/* A suspension outranks every other banner — it's the reason nothing
          else is working, so nothing else should be competing with it. */}
      {profile?.isSuspended ? (
        <Alert tone="danger">
          <strong>Your account is suspended.</strong> Your public page is hidden
          and students can&rsquo;t book or pay. Reason given:{" "}
          {profile.suspendedReason ?? "none recorded"}. Your existing classes and
          students are untouched — get in touch to sort it out.
        </Alert>
      ) : null}

      {/* First-run guidance. Disappears as soon as the work is actually done. */}
      {!hasClasses ? (
        <Alert tone="info">
          <strong>Start here:</strong> add your first class under{" "}
          <Link href="/studio/offerings" className="underline">
            Classes
          </Link>
          , set its prices, then give it a recurring time under{" "}
          <Link href="/studio/schedule" className="underline">
            Schedule
          </Link>
          .
        </Alert>
      ) : !isPublished ? (
        <Alert tone="warning">
          Your public page is still hidden, so students can&rsquo;t find you.{" "}
          <Link href="/studio/profile" className="font-medium underline">
            Publish it
          </Link>{" "}
          when you&rsquo;re ready.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active students" value={stats.activeStudents} tone="brand" />
        <StatTile label="Upcoming classes" value={stats.upcomingSessions} />
        <StatTile
          label="Earned this month"
          value={formatMoney(stats.monthRevenuePaise)}
          sub={`${formatMoney(stats.revenuePaise)} all time`}
        />
        <StatTile
          label="Awaiting payment"
          value={formatMoney(stats.pendingPaise)}
          tone={stats.pendingPaise > 0 ? "accent" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------------------------ this week */}
        <section>
          <SectionTitle
            action={
              <Link
                href="/studio/schedule"
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                Full schedule →
              </Link>
            }
          >
            Next 7 days
          </SectionTitle>

          {upcoming.length === 0 ? (
            <EmptyState
              title="No classes this week"
              description="Set a recurring time and sessions generate themselves."
              action={
                <ButtonLink href="/studio/schedule">Set up a schedule</ButtonLink>
              }
            />
          ) : (
            <div className="space-y-2">
              {upcoming.map((s) => {
                const seatsLeft = Math.max(0, s.capacity - Number(s.booked));
                return (
                  <Link
                    key={s.id}
                    href={`/studio/sessions/${s.id}`}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{s.title}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {formatDateRange(s.startsAt, s.endsAt, user.timezone)}
                      </p>
                    </div>
                    <Badge tone={seatsLeft === 0 ? "warning" : "soft"}>
                      <Users className="h-3 w-3" />
                      {Number(s.booked)}/{s.capacity}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* --------------------------------------------- recent + shortcuts */}
        <div className="space-y-6">
          <section>
            <SectionTitle>Recent enrolments</SectionTitle>
            {recentEnrolments.length === 0 ? (
              <Card className="p-4 text-sm text-ink-soft">
                No enrolments yet.
              </Card>
            ) : (
              <Card className="divide-y divide-line">
                {recentEnrolments.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-3.5">
                    <Avatar name={e.studentName} src={e.studentAvatar} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {e.studentName}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {e.offeringTitle}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {formatRelative(e.createdAt)}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section>
            <SectionTitle>Quick actions</SectionTitle>
            <div className="grid gap-2">
              <Shortcut
                href="/studio/updates"
                icon={Megaphone}
                title="Post an update"
                body="Tell your students what's on today."
              />
              <Shortcut
                href="/studio/media"
                icon={Video}
                title="Add a video"
                body="Publish a vlog or share a class recording."
              />
              <Shortcut
                href="/studio/payments"
                icon={Users}
                title="Record a cash payment"
                body="Someone paid you in person? Log it here."
              />
            </div>
          </section>
        </div>
      </div>

      {profile ? (
        <p className="text-xs text-ink-faint">
          Teaching {parseList<string>(profile.disciplines).join(", ") || "—"} ·{" "}
          {profile.city} · {profile.isVerified ? "Verified" : "Not yet verified"}
        </p>
      ) : null}
    </div>
  );
}

function Shortcut({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-brand-300"
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{body}</span>
      </span>
    </Link>
  );
}
