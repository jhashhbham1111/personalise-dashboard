import Link from "next/link";
import type { Metadata } from "next";

import { requireInstructor } from "@/lib/auth";
import { DISCIPLINES } from "@/lib/enums";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Explore" };

/**
 * A discipline picker for instructors, not students — same tiles as the
 * public directory filter, but the point here is inspiration: see who else
 * teaches a topic and watch a snippet of how they run a class.
 */
export default async function StudioExplorePage() {
  await requireInstructor();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore"
        description="Pick a discipline to see instructors teaching it and watch a few of their videos."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {DISCIPLINES.map((discipline) => (
          <Link
            key={discipline}
            href={`/instructors?discipline=${encodeURIComponent(discipline)}`}
            className="flex items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            {discipline}
          </Link>
        ))}
      </div>
    </div>
  );
}
