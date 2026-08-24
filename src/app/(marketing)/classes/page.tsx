import type { Metadata } from "next";
import { CalendarX } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import {
  classCities,
  enrolledOfferingIds,
  getInstructorBySlug,
  listUpcomingSessions,
} from "@/lib/queries";
import { DISCIPLINES } from "@/lib/enums";
import {
  addDays,
  DEFAULT_TIMEZONE,
  formatLongDate,
  fromDateInput,
} from "@/lib/time";
import { SessionCard } from "@/components/session-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import {
  FilterBar,
  FilterChips,
  FilterDate,
  FilterSelect,
} from "@/components/filter-bar";
import { listFilters, pluralize } from "@/lib/utils";

/** Rebuilds the current URL with one param changed. */
function buildHref(
  basePath: string,
  params: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export const metadata: Metadata = {
  title: "Upcoming classes",
  description:
    "Live online and in-person classes you can book right now, across every discipline.",
};

/**
 * How far ahead to look, in days. Everything used to load at once — up to 120
 * classes in one endless scroll, which buries the ones happening soon under
 * five weeks of future timetable. A week is what someone deciding "what can I
 * go to?" actually wants; the rest is a filter away.
 */
const RANGES = [
  { value: "7", label: "Next 7 days" },
  { value: "3", label: "Next 3 days" },
  { value: "14", label: "Next 2 weeks" },
  { value: "30", label: "Next month" },
  { value: "all", label: "Everything scheduled" },
] as const;

const DEFAULT_RANGE = "7";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    discipline?: string;
    city?: string;
    mode?: string;
    instructor?: string;
    within?: string;
    from?: string;
  }>;
}) {
  const params = await searchParams;
  const viewer = await getCurrentUser();
  const tz = viewer?.timezone ?? DEFAULT_TIMEZONE;

  const instructorRow = params.instructor
    ? await getInstructorBySlug(params.instructor)
    : null;

  const within = RANGES.some((r) => r.value === params.within)
    ? params.within!
    : DEFAULT_RANGE;

  // An explicit start date lets someone look at a particular week without
  // scrolling from today.
  const from = params.from ? fromDateInput(params.from, tz) : undefined;
  const rangeStart = from ?? new Date();
  const to =
    within === "all" ? undefined : addDays(rangeStart, Number(within));

  const [sessions, cities, enrolledIds] = await Promise.all([
    listUpcomingSessions({
      discipline: params.discipline,
      city: params.city,
      mode: params.mode,
      instructorId: instructorRow?.profile.id,
      from,
      to,
      limit: 120,
    }),
    // Venue cities included: an in-person class in a city no instructor lives
    // in was previously unfilterable, because the options came only from
    // instructor profiles.
    classCities(),
    viewer ? enrolledOfferingIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  const cardViewer = { signedIn: !!viewer, enrolledOfferingIds: enrolledIds };

  // Which filters are actually narrowing the results, so the empty state can
  // offer to drop exactly those and nothing else.
  const activeFilters = [
    params.discipline && "discipline",
    params.city && "city",
    params.mode && "format",
    params.from && "start date",
    within !== DEFAULT_RANGE && "date range",
  ].filter(Boolean) as string[];

  const rangeLabel =
    RANGES.find((r) => r.value === within)?.label ?? "Next 7 days";

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
        {params.discipline ? (
          <input type="hidden" name="discipline" value={params.discipline} />
        ) : null}
        <FilterSelect
          name="within"
          label="How far ahead"
          defaultValue={within}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <FilterDate
          name="from"
          label="Starting from"
          defaultValue={params.from ?? ""}
        />
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
          within: within === DEFAULT_RANGE ? undefined : within,
          from: params.from,
        }}
        className="mt-4"
      />

      <p className="mt-6 text-sm text-ink-soft">
        {pluralize(sessions.length, "class", "classes")} in the{" "}
        {rangeLabel.toLowerCase()}
        {sessions.length === 120 ? " (showing the first 120)" : ""}
      </p>

      {sessions.length === 0 ? (
        /*
         * The way out has to actually get you somewhere. This used to offer
         * only "show everything scheduled", which widened the dates but kept
         * every other filter — and once you were already on "all", it offered
         * nothing at all, which is exactly the dead end you reach after
         * stacking filters. Widening dates is still the first thing to try
         * when that's the binding constraint, but clearing outright is always
         * available.
         */
        <EmptyState
          className="mt-4"
          icon={<CalendarX className="h-8 w-8" />}
          title="Nothing scheduled that matches"
          description={
            activeFilters.length > 0
              ? `No classes match your ${listFilters(activeFilters)}.`
              : "There's nothing on the timetable just yet. Check back soon."
          }
          action={
            activeFilters.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {within !== "all" ? (
                  <ButtonLink
                    href={buildHref("/classes", { ...params, within: "all" })}
                    variant="secondary"
                  >
                    Look further ahead
                  </ButtonLink>
                ) : null}
                <ButtonLink
                  href={buildHref("/classes", {
                    // The one filter worth keeping: arriving from an
                    // instructor's page and being dumped into the full
                    // marketplace loses the thread of what you were browsing.
                    instructor: params.instructor,
                  })}
                >
                  Clear filters
                </ButtonLink>
              </div>
            ) : undefined
          }
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
                  <SessionCard
                    key={s.id}
                    session={s}
                    timezone={tz}
                    viewer={cardViewer}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
