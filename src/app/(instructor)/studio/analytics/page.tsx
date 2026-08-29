import type { Metadata } from "next";
import { TrendingUp, Users, CalendarClock } from "lucide-react";

import { requireInstructor } from "@/lib/auth";
import { instructorAnalytics } from "@/lib/queries";
import { formatDate } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle, StatTile } from "@/components/ui/page";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const user = await requireInstructor();
  const stats = await instructorAnalytics(user.instructorProfileId);

  const maxWeekPaise = Math.max(1, ...stats.revenueByWeek.map((w) => w.totalPaise));
  const maxSlotBookings = Math.max(1, ...stats.popularSlots.map((s) => s.bookings));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="How your teaching is trending — revenue, attendance and your busiest times."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Attendance rate"
          value={
            stats.attendanceRate === null
              ? "—"
              : `${Math.round(stats.attendanceRate * 100)}%`
          }
          sub={
            stats.attendedCount + stats.noShowCount > 0
              ? `${stats.attendedCount} attended, ${stats.noShowCount} missed`
              : "No marked attendance yet"
          }
          tone="brand"
        />
        <StatTile
          label="Students who came back"
          value={
            stats.repeatRate === null ? "—" : `${Math.round(stats.repeatRate * 100)}%`
          }
          sub={
            stats.totalStudents > 0
              ? `${stats.repeatStudents} of ${stats.totalStudents} students`
              : "No bookings yet"
          }
        />
        <StatTile
          label="Unique students"
          value={stats.totalStudents}
          sub="ever booked with you"
        />
      </div>

      <section>
        <SectionTitle>Revenue by week</SectionTitle>
        {stats.revenueByWeek.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="No revenue recorded yet"
            description="Weeks with a paid enrolment will show up here."
          />
        ) : (
          <Card className="space-y-3 p-5">
            {stats.revenueByWeek.map((w) => {
              const widthPct = Math.max(4, Math.round((w.totalPaise / maxWeekPaise) * 100));
              return (
                <div key={w.weekStartMs} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-ink-soft">
                    {formatDate(new Date(w.weekStartMs))}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
                    {formatMoney(w.totalPaise)}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Busiest class times</SectionTitle>
        {stats.popularSlots.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-8 w-8" />}
            title="No bookings yet"
            description="Once students start booking, your busiest slots show up here."
          />
        ) : (
          <Card className="space-y-3 p-5">
            {stats.popularSlots.map((slot) => {
              const widthPct = Math.max(
                4,
                Math.round((slot.bookings / maxSlotBookings) * 100),
              );
              const label = `${slot.day} ${formatHour(slot.hour)}`;
              return (
                <div key={`${slot.day}-${slot.hour}`} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-accent-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-right text-sm font-medium tabular-nums text-ink">
                    <Users className="h-3.5 w-3.5 text-ink-faint" />
                    {slot.bookings}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}

/** 6 → "6 AM", 18 → "6 PM", 0 → "12 AM". */
function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${period}`;
}
