import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, eq, gte } from "drizzle-orm";
import { CalendarClock, MapPin, Video } from "lucide-react";

import {
  bookings,
  classSessions,
  db,
  offerings,
  scheduleRules,
  venues,
} from "@/db";
import { requireInstructor } from "@/lib/auth";
import { BookingStatus, MODE_LABEL } from "@/lib/enums";
import { describeDays } from "@/lib/recurrence";
import {
  addDays,
  formatDuration,
  formatLongDate,
  formatMinutesOfDay,
  formatTime,
  toDateInput,
  zonedParts,
} from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { RuleDialog } from "./rule-dialog";
import { DeleteRuleButton } from "./delete-rule-button";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const user = await requireInstructor();
  const now = new Date();

  const [rules, offeringRows, venueRows, upcoming] = await Promise.all([
    db.query.scheduleRules.findMany({
      where: and(
        eq(scheduleRules.instructorId, user.instructorProfileId),
        eq(scheduleRules.isActive, true),
      ),
      with: { offering: true, venue: true },
      orderBy: [asc(scheduleRules.startTimeMinutes)],
    }),

    db
      .select({
        id: offerings.id,
        title: offerings.title,
        mode: offerings.mode,
        durationMin: offerings.durationMin,
      })
      .from(offerings)
      .where(
        and(
          eq(offerings.instructorId, user.instructorProfileId),
          eq(offerings.isActive, true),
        ),
      )
      .orderBy(asc(offerings.title)),

    db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .where(
        and(
          eq(venues.instructorId, user.instructorProfileId),
          eq(venues.isActive, true),
        ),
      ),

    // Everything from the start of last month forward, so paging back a month
    // in the calendar isn't empty. The horizon is 60 days ahead, so this stays
    // a few hundred rows at most.
    db
      .select({
        id: classSessions.id,
        title: classSessions.title,
        startsAt: classSessions.startsAt,
        endsAt: classSessions.endsAt,
        mode: classSessions.mode,
        capacity: classSessions.capacity,
        status: classSessions.status,
        offeringId: classSessions.offeringId,
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
          gte(classSessions.startsAt, addDays(now, -45)),
        ),
      )
      .orderBy(asc(classSessions.startsAt))
      .limit(400),
  ]);

  // The calendar is a client component, so instants are converted to the
  // instructor's local day and time here — the browser's own timezone is
  // irrelevant and would silently shift classes for anyone travelling.
  const calendarSessions = upcoming.map((s) => {
    const p = zonedParts(s.startsAt, user.timezone);
    return {
      id: s.id,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      offeringId: s.offeringId,
      status: s.status,
      booked: Number(s.booked),
      capacity: s.capacity,
      day: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
      time: formatTime(s.startsAt, user.timezone),
    };
  });

  const todayParts = zonedParts(now, user.timezone);
  const todayKey = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;

  const nextUp = upcoming.filter((s) => s.startsAt >= now).slice(0, 5);

  const defaultStartDate = toDateInput(now, user.timezone);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Schedule"
        description="Set a repeating pattern once. Sessions are generated for the next 60 days and roll forward automatically."
        actions={
          offeringRows.length > 0 ? (
            <RuleDialog
              offerings={offeringRows}
              venues={venueRows}
              defaultStartDate={defaultStartDate}
              timezone={user.timezone}
              triggerLabel="New class time"
              showIcon
            />
          ) : undefined
        }
      />

      {offeringRows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-8 w-8" />}
          title="Add a class first"
          description="A schedule needs something to schedule. Create a class, then come back and give it a time."
          action={<ButtonLink href="/studio/offerings/new">Add a class</ButtonLink>}
        />
      ) : (
        <>
          {/* ------------------------------------------------ the patterns */}
          <section>
            <SectionTitle>Repeating class times</SectionTitle>

            {rules.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-8 w-8" />}
                title="No repeating times set"
                description="Tell us which days and what time, and we'll fill your calendar."
                action={
                  <RuleDialog
                    offerings={offeringRows}
                    venues={venueRows}
                    defaultStartDate={defaultStartDate}
                    timezone={user.timezone}
                    triggerLabel="Set a class time"
                  />
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {rules.map((r) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {r.offering.title}
                        </p>
                        <p className="mt-1 text-sm text-brand-700">
                          {describeDays(r.daysOfWeek)} ·{" "}
                          {formatMinutesOfDay(r.startTimeMinutes)}
                        </p>
                      </div>
                      <Badge tone={r.mode === "ONLINE" ? "info" : "warning"}>
                        {r.mode === "ONLINE" ? (
                          <Video className="h-3 w-3" />
                        ) : (
                          <MapPin className="h-3 w-3" />
                        )}
                        {MODE_LABEL[r.mode]}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
                      <span>{formatDuration(r.durationMin)}</span>
                      <span>{r.timezone.replace("_", " ")}</span>
                      {r.venue ? <span>{r.venue.name}</span> : null}
                      {r.endDate ? (
                        <span>
                          until {formatLongDate(r.endDate, user.timezone)}
                        </span>
                      ) : (
                        <span>no end date</span>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <RuleDialog
                        offerings={offeringRows}
                        venues={venueRows}
                        defaultStartDate={defaultStartDate}
                        timezone={user.timezone}
                        rule={{
                          id: r.id,
                          offeringId: r.offeringId,
                          daysOfWeek: r.daysOfWeek,
                          startTimeMinutes: r.startTimeMinutes,
                          durationMin: r.durationMin,
                          timezone: r.timezone,
                          startDate: toDateInput(r.startDate, r.timezone),
                          endDate: r.endDate
                            ? toDateInput(r.endDate, r.timezone)
                            : "",
                          mode: r.mode,
                          venueId: r.venueId,
                        }}
                        triggerLabel="Edit"
                        triggerVariant="secondary"
                        triggerSize="sm"
                      />
                      <DeleteRuleButton
                        ruleId={r.id}
                        label={`${r.offering.title} — ${describeDays(r.daysOfWeek)}`}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* -------------------------------------------- generated calendar */}
          <section>
            <SectionTitle>Your calendar</SectionTitle>

            {calendarSessions.length === 0 ? (
              <Card className="p-5 text-sm text-ink-soft">
                Nothing generated yet. Add a repeating class time above.
              </Card>
            ) : (
              <>
                <ScheduleCalendar
                  sessions={calendarSessions}
                  todayKey={todayKey}
                  offeringNames={offeringRows.map((o) => ({
                    id: o.id,
                    title: o.title,
                  }))}
                />

                {nextUp.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-medium text-ink">
                      Coming up next
                    </h3>
                    <Card className="divide-y divide-line">
                      {nextUp.map((s) => {
                        const seatsLeft = Math.max(
                          0,
                          s.capacity - Number(s.booked),
                        );
                        return (
                          <Link
                            key={s.id}
                            href={`/studio/sessions/${s.id}`}
                            className="flex items-center gap-3 p-3.5 transition-colors hover:bg-brand-50"
                          >
                            <span className="w-40 shrink-0 text-sm tabular-nums text-ink-soft">
                              {formatLongDate(s.startsAt, user.timezone)}
                            </span>
                            <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-ink">
                              {formatTime(s.startsAt, user.timezone)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {s.title}
                            </span>
                            <Badge tone={seatsLeft === 0 ? "warning" : "soft"}>
                              {Number(s.booked)}/{s.capacity}
                            </Badge>
                          </Link>
                        );
                      })}
                    </Card>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
