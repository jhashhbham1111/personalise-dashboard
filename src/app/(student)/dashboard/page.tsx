import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, PartyPopper, Ticket } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { studentBookings, studentEnrollments } from "@/lib/queries";
import { BookingStatus } from "@/lib/enums";
import { formatRelative } from "@/lib/time";
import { pluralize } from "@/lib/utils";
import { Alert, EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { BookingRow } from "@/components/booking-row";
import { PassCard } from "@/components/pass-card";

export const metadata: Metadata = { title: "My classes" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const { paid } = await searchParams;
  // One clock for the whole page so every card agrees on what "expiring" means.
  const now = new Date();
  const user = await requireUser("/dashboard");

  const [upcoming, enrolments] = await Promise.all([
    studentBookings(user.id, { upcoming: true, limit: 6 }),
    studentEnrollments(user.id),
  ]);

  const live = upcoming.filter(
    (b) => b.booking.status !== BookingStatus.CANCELLED,
  );
  const activePasses = enrolments.filter((e) => e.status === "ACTIVE");
  const next = live[0];

  const totalCredits = activePasses.reduce(
    (sum, e) => sum + (e.sessionsRemaining ?? 0),
    0,
  );
  const hasUnlimited = activePasses.some((e) => e.sessionsRemaining === null);

  return (
    <div className="space-y-8">
      {paid ? (
        <Alert tone="success">
          <span className="inline-flex items-center gap-2">
            <PartyPopper className="h-4 w-4" />
            Payment confirmed — your pass is active. Book your first session
            below.
          </span>
        </Alert>
      ) : null}

      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={
          next
            ? `Your next class is ${formatRelative(next.session.startsAt)}.`
            : "Nothing booked yet — find a class to get started."
        }
        actions={<ButtonLink href="/classes">Find a class</ButtonLink>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Upcoming classes"
          value={live.length}
          tone={live.length > 0 ? "brand" : "default"}
        />
        <StatTile
          label="Active passes"
          value={activePasses.length}
          sub={
            activePasses.length
              ? hasUnlimited
                ? "Includes an unlimited pass"
                : `${pluralize(totalCredits, "session")} remaining`
              : undefined
          }
        />
        <StatTile label="Instructors" value={new Set(enrolments.map((e) => e.instructorId)).size} />
      </div>

      {/* ---------------------------------------------------------- next up */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Coming up
          </h2>
          <Link
            href="/dashboard/bookings"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            All bookings →
          </Link>
        </div>

        {live.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No classes booked"
            description="Browse what's on and book your first session."
            action={<ButtonLink href="/classes">Browse classes</ButtonLink>}
          />
        ) : (
          <div className="space-y-2">
            {live.map((row) => (
              <BookingRow key={row.booking.id} row={row} timezone={user.timezone} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- passes */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            My passes
          </h2>
          <Link
            href="/dashboard/passes"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            All passes →
          </Link>
        </div>

        {activePasses.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-8 w-8" />}
            title="No active passes"
            description="Got a pass code from your instructor? Redeem it here. Otherwise, find an instructor to enrol with."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/dashboard/redeem">Redeem a code</ButtonLink>
                <ButtonLink href="/instructors" variant="secondary">
                  Find an instructor
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activePasses.slice(0, 6).map((e) => (
              <PassCard key={e.id} enrolment={e} timezone={user.timezone} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
