import type { Metadata } from "next";
import { CalendarX } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import {
  getInstructorBySlug,
  instructorCities,
  listUpcomingSessions,
} from "@/lib/queries";
import { DISCIPLINES } from "@/lib/enums";
import { DEFAULT_TIMEZONE, formatLongDate } from "@/lib/time";
import { SessionCard } from "@/components/session-card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { FilterBar, FilterChips, FilterSelect } from "@/components/filter-bar";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Upcoming classes",
  description:
    "Live online and in-person classes you can book right now, across every discipline.",
};

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    discipline?: string;
    city?: string;
    mode?: string;
    instructor?: string;
  }>;
}) {
  const params = await searchParams;
  const viewer = await getCurrentUser();
  const tz = viewer?.timezone ?? DEFAULT_TIMEZONE;

  const instructorRow = params.instructor
    ? await getInstructorBySlug(params.instructor)
    : null;

  const [sessions, cities] = await Promise.all([
    listUpcomingSessions({
      discipline: params.discipline,
      city: params.city,
      mode: params.mode,
      instructorId: instructorRow?.profile.id,
      limit: 120,
    }),
    instructorCities(),
  ]);

  // Group by local calendar day so the page reads like a schedule, not a list.
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = formatLongDate(s.startsAt, tz);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title={
          instructorRow ? `Classes with ${instructorRow.user.name}` : "Upcoming classes"
        }
        description={`Times are shown in your timezone (${tz.replace("_", " ")}).`}
      />

      <FilterBar className="mt-6" basePath="/classes">
        {params.instructor ? (
          <input type="hidden" name="instructor" value={params.instructor} />
        ) : null}
        <FilterSelect
          name="mode"
          label="Format"
          defaultValue={params.mode ?? ""}
          options={[
            { value: "", label: "Online & in person" },
            { value: "ONLINE", label: "Online only" },
            { value: "OFFLINE", label: "In person only" },
          ]}
        />
        <FilterSelect
          name="city"
          label="City"
          defaultValue={params.city ?? ""}
          options={[
            { value: "", label: "Any city" },
            ...cities.map((c) => ({ value: c, label: c })),
          ]}
        />
      </FilterBar>

      <FilterChips
        basePath="/classes"
        param="discipline"
        current={params.discipline}
        options={DISCIPLINES}
        carry={{
          city: params.city,
          mode: params.mode,
          instructor: params.instructor,
        }}
        className="mt-4"
      />

      <p className="mt-6 text-sm text-ink-soft">
        {pluralize(sessions.length, "class", "classes")} coming up
      </p>

      {sessions.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<CalendarX className="h-8 w-8" />}
          title="Nothing scheduled that matches"
          description="Try a different discipline, or widen the format filter."
        />
      ) : (
        <div className="mt-4 space-y-8">
          {Array.from(groups.entries()).map(([day, items]) => (
            <section key={day}>
              <h2 className="sticky top-16 z-10 -mx-1 mb-3 bg-paper/90 px-1 py-1.5 text-sm font-semibold text-ink backdrop-blur">
                {day}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <SessionCard key={s.id} session={s} timezone={tz} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
