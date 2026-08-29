import Link from "next/link";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { db, instructorProfiles, venues } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { parseList } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page";
import { OfferingForm } from "../offering-form";

export const metadata: Metadata = { title: "New class" };

export default async function NewOfferingPage() {
  const user = await requireInstructor();

  // The instructor already chose their disciplines during onboarding; a new
  // class inherits the one they teach rather than asking again.
  const profile = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, user.instructorProfileId),
    columns: { disciplines: true },
  });
  const profileDisciplines = parseList<string>(profile?.disciplines);

  const venueRows = await db
    .select({ id: venues.id, name: venues.name, city: venues.city })
    .from(venues)
    .where(
      and(
        eq(venues.instructorId, user.instructorProfileId),
        eq(venues.isActive, true),
      ),
    );

  return (
    <div className="max-w-2xl space-y-6">
      <nav className="text-sm text-ink-soft">
        <Link href="/studio/offerings" className="hover:text-brand-700">
          Classes
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <span>New</span>
      </nav>

      <PageHeader
        title="New class"
        description="Describe what you teach. You'll set prices and a schedule next."
      />

      <OfferingForm
        venues={venueRows}
        profileDisciplines={profileDisciplines}
        initial={{
          title: "",
          summary: "",
          description: "",
          discipline: profileDisciplines[0] ?? "Yoga",
          type: "GROUP_CLASS",
          mode: "ONLINE",
          level: "ALL_LEVELS",
          durationMin: 60,
          capacity: 20,
          minCapacity: null,
          venueId: null,
          isActive: true,
        }}
      />
    </div>
  );
}
