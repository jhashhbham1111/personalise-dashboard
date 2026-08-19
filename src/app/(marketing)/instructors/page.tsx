import type { Metadata } from "next";
import { Search, UserSearch } from "lucide-react";

import { instructorCities, listInstructors } from "@/lib/queries";
import { DISCIPLINES } from "@/lib/enums";
import { InstructorCard } from "@/components/instructor-card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { FilterBar, FilterChips, FilterSelect } from "@/components/filter-bar";
import { Input } from "@/components/ui/input";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find an instructor",
  description:
    "Browse yoga teachers, musicians, dancers and coaches taking students now.",
};

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string; city?: string; q?: string }>;
}) {
  const params = await searchParams;

  const [instructors, cities] = await Promise.all([
    listInstructors({
      discipline: params.discipline,
      city: params.city,
      q: params.q,
    }),
    instructorCities(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Find an instructor"
        description="Every profile here is run by the person who teaches the class."
      />

      <FilterBar className="mt-6" basePath="/instructors">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, discipline or keyword"
            className="pl-9"
            aria-label="Search instructors"
          />
        </div>

        <FilterSelect
          name="city"
          defaultValue={params.city ?? ""}
          label="City"
          options={[
            { value: "", label: "Any city" },
            ...cities.map((c) => ({ value: c, label: c })),
          ]}
        />
      </FilterBar>

      <FilterChips
        basePath="/instructors"
        param="discipline"
        current={params.discipline}
        options={DISCIPLINES}
        carry={{ city: params.city, q: params.q }}
        className="mt-4"
      />

      <p className="mt-6 text-sm text-ink-soft">
        {pluralize(instructors.length, "instructor")}
        {params.discipline ? ` teaching ${params.discipline}` : ""}
        {params.city ? ` in ${params.city}` : ""}
      </p>

      {instructors.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<UserSearch className="h-8 w-8" />}
          title="No instructors match that yet"
          description="Try clearing a filter, or search for a different discipline."
        />
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((i) => (
            <InstructorCard key={i.id} instructor={i} />
          ))}
        </div>
      )}
    </div>
  );
}
