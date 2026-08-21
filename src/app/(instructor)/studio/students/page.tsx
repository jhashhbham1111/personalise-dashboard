import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { Search, Users } from "lucide-react";

import { bookings, db, enrollments, offerings, pricingPlans, users } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { Attendance, BookingStatus, EnrollmentStatus } from "@/lib/enums";
import { formatDate, formatRelative } from "@/lib/time";
import { pluralize } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { FilterBar } from "@/components/filter-bar";
import { Input } from "@/components/ui/input";
import { Pagination, readPage } from "@/components/pagination";

export const metadata: Metadata = { title: "Students" };

const PER_PAGE = 40;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const user = await requireInstructor();
  const now = new Date();

  const mine = eq(enrollments.instructorId, user.instructorProfileId);

  const query = (q ?? "").trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  // Finding one person among a hundred by scrolling is not a workflow, so the
  // same name/email/phone match the payment picker uses applies here too.
  const searchWhere = query
    ? digits.length >= 4
      ? sql`(lower(${users.name}) like ${`%${query}%`}
             or lower(${users.email}) like ${`%${query}%`}
             or replace(replace(replace(coalesce(${users.phone}, ''), ' ', ''), '-', ''), '+', '') like ${`%${digits}%`})`
      : sql`(lower(${users.name}) like ${`%${query}%`}
             or lower(${users.email}) like ${`%${query}%`})`
    : undefined;

  const activeWhere = and(
    mine,
    eq(enrollments.status, EnrollmentStatus.ACTIVE),
    searchWhere,
  );

  /**
   * Stats come from SQL across every enrolment, not the page on screen — a
   * paged list that sums only what it can see reports a smaller roster the
   * moment an instructor passes forty students.
   */
  const [[stats], [{ total }]] = await Promise.all([
    db
      .select({
        students: sql<number>`count(distinct ${enrollments.studentId})`,
        lowCredit: sql<number>`sum(case when ${enrollments.sessionsRemaining} is not null and ${enrollments.sessionsRemaining} <= 2 then 1 else 0 end)`,
        expiringSoon: sql<number>`sum(case when ${enrollments.expiresAt} is not null and ${enrollments.expiresAt} < ${now.getTime() + 7 * 24 * 3600_000} then 1 else 0 end)`,
      })
      .from(enrollments)
      .where(and(mine, eq(enrollments.status, EnrollmentStatus.ACTIVE))),
    db
      .select({ total: sql<number>`count(*)` })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(activeWhere),
  ]);

  const { page, pageCount, offset } = readPage(pageParam, Number(total), PER_PAGE);

  const selection = {
    enrolmentId: enrollments.id,
    status: enrollments.status,
    sessionsRemaining: enrollments.sessionsRemaining,
    startedAt: enrollments.startedAt,
    expiresAt: enrollments.expiresAt,
    studentId: users.id,
    studentName: users.name,
    studentEmail: users.email,
    studentPhone: users.phone,
    studentAvatar: users.avatarUrl,
    offeringTitle: offerings.title,
    planName: pricingPlans.name,
    attended: db.$count(
      bookings,
      and(
        eq(bookings.enrollmentId, enrollments.id),
        eq(bookings.attendance, Attendance.ATTENDED),
      ),
    ),
    upcoming: db.$count(
      bookings,
      and(
        eq(bookings.enrollmentId, enrollments.id),
        eq(bookings.status, BookingStatus.CONFIRMED),
        eq(bookings.attendance, Attendance.PENDING),
      ),
    ),
  };

  const [active, lapsed] = await Promise.all([
    db
      .select(selection)
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
      .leftJoin(pricingPlans, eq(pricingPlans.id, enrollments.planId))
      .where(activeWhere)
      .orderBy(desc(enrollments.createdAt))
      .limit(PER_PAGE)
      .offset(offset),

    db
      .select(selection)
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
      .leftJoin(pricingPlans, eq(pricingPlans.id, enrollments.planId))
      .where(
        and(mine, sql`${enrollments.status} <> ${EnrollmentStatus.ACTIVE}`),
      )
      .orderBy(desc(enrollments.createdAt))
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Everyone enrolled with you, and how much they have left."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Active students"
          value={Number(stats.students)}
          tone="brand"
        />
        <StatTile
          label="Nearly out of sessions"
          value={Number(stats.lowCredit ?? 0)}
          tone={Number(stats.lowCredit ?? 0) > 0 ? "accent" : "default"}
          sub={Number(stats.lowCredit ?? 0) > 0 ? "worth a nudge" : undefined}
        />
        <StatTile
          label="Passes expiring this week"
          value={Number(stats.expiringSoon ?? 0)}
          tone={Number(stats.expiringSoon ?? 0) > 0 ? "accent" : "default"}
        />
      </div>

      <FilterBar basePath="/studio/students">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, email or phone"
            aria-label="Search students"
            className="pl-9"
          />
        </div>
      </FilterBar>

      {active.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={query ? "No students match that" : "No students yet"}
          description={
            query
              ? "Try part of their name, email address or phone number."
              : "Once someone buys a pass they'll appear here with their remaining sessions."
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper text-left">
                    <Th>Student</Th>
                    <Th>Class</Th>
                    <Th>Pass</Th>
                    <Th>Left</Th>
                    <Th>Attended</Th>
                    <Th>Expires</Th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => {
                    const low =
                      r.sessionsRemaining !== null && r.sessionsRemaining <= 2;
                    return (
                      <tr
                        key={r.enrolmentId}
                        className="border-b border-line last:border-0"
                      >
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              name={r.studentName}
                              src={r.studentAvatar}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">
                                {r.studentName}
                              </p>
                              <p className="truncate text-xs text-ink-faint">
                                {r.studentPhone ?? r.studentEmail}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td className="text-ink-soft">{r.offeringTitle}</Td>
                        <Td className="text-ink-soft">{r.planName ?? "—"}</Td>
                        <Td>
                          {r.sessionsRemaining === null ? (
                            <Badge tone="success">Unlimited</Badge>
                          ) : (
                            <span
                              className={
                                low
                                  ? "font-semibold tabular-nums text-accent-700"
                                  : "tabular-nums text-ink"
                              }
                            >
                              {pluralize(r.sessionsRemaining, "session")}
                            </span>
                          )}
                        </Td>
                        <Td className="tabular-nums text-ink-soft">
                          {Number(r.attended)}
                          {Number(r.upcoming) > 0 ? (
                            <span className="ml-1 text-xs text-ink-faint">
                              (+{Number(r.upcoming)} booked)
                            </span>
                          ) : null}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-soft">
                          {r.expiresAt
                            ? formatDate(r.expiresAt, user.timezone)
                            : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            page={page}
            pageCount={pageCount}
            basePath="/studio/students"
            params={{ q }}
          />
        </>
      )}

      {lapsed.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm text-ink-soft hover:text-ink">
            {lapsed.length} expired or cancelled{" "}
            {lapsed.length === 1 ? "pass" : "passes"}
          </summary>
          <Card className="mt-3 divide-y divide-line">
            {lapsed.map((r) => (
              <div key={r.enrolmentId} className="flex items-center gap-3 p-3.5">
                <Avatar name={r.studentName} src={r.studentAvatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink-soft">
                    {r.studentName}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {r.offeringTitle}
                  </p>
                </div>
                <Badge tone="soft">{r.status.toLowerCase()}</Badge>
                <span className="shrink-0 text-xs text-ink-faint">
                  started {formatRelative(r.startedAt)}
                </span>
              </div>
            ))}
          </Card>
        </details>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
