import type { Metadata } from "next";
import { Ticket } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { studentEnrollments } from "@/lib/queries";
import { PassCard } from "@/components/pass-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "My passes" };

export default async function PassesPage() {
  // One clock for the whole page so every card agrees on what "expiring" means.
  const now = new Date();
  const user = await requireUser("/dashboard/passes");
  const all = await studentEnrollments(user.id);

  const active = all.filter((e) => e.status === "ACTIVE");
  const inactive = all.filter((e) => e.status !== "ACTIVE");

  return (
    <div className="space-y-8">
      <PageHeader
        title="My passes"
        description="Class packs, monthly passes and drop-ins you've bought."
        actions={<ButtonLink href="/instructors">Find an instructor</ButtonLink>}
      />

      <section>
        <SectionTitle>Active</SectionTitle>
        {active.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-8 w-8" />}
            title="No active passes"
            description="Enrol with an instructor to start booking classes."
            action={<ButtonLink href="/instructors">Browse instructors</ButtonLink>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((e) => (
              <PassCard key={e.id} enrolment={e} timezone={user.timezone} now={now} />
            ))}
          </div>
        )}
      </section>

      {inactive.length > 0 ? (
        <section>
          <SectionTitle>Expired & past</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((e) => (
              <PassCard key={e.id} enrolment={e} timezone={user.timezone} now={now} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
