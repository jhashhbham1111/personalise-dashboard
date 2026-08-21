import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";

import { db, offerings, pricingPlans, venues } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { paiseToRupees } from "@/lib/utils";
import { Alert, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { OfferingForm } from "../offering-form";
import { PlanEditor } from "./plan-editor";
import { ArchiveOfferingButton } from "./archive-button";

export const metadata: Metadata = { title: "Edit class" };

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireInstructor();

  const offering = await db.query.offerings.findFirst({
    where: and(
      eq(offerings.id, id),
      eq(offerings.instructorId, user.instructorProfileId),
    ),
    with: { plans: { orderBy: [asc(pricingPlans.sortOrder)] } },
  });
  if (!offering) notFound();

  const venueRows = await db
    .select({ id: venues.id, name: venues.name, city: venues.city })
    .from(venues)
    .where(
      and(
        eq(venues.instructorId, user.instructorProfileId),
        eq(venues.isActive, true),
      ),
    );

  const activePlans = offering.plans.filter((p) => p.isActive);

  return (
    <div className="max-w-2xl space-y-6">
      <nav className="text-sm text-ink-soft">
        <Link href="/studio/offerings" className="hover:text-brand-700">
          Classes
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <span className="truncate">{offering.title}</span>
      </nav>

      <PageHeader
        title={offering.title}
        description="Edit the class, its prices, and whether it's taking students."
        actions={
          user.instructorSlug ? (
            <ButtonLink
              href={`/i/${user.instructorSlug}/enrol/${offering.slug}`}
              variant="secondary"
              size="sm"
            >
              Preview
            </ButtonLink>
          ) : undefined
        }
      />

      {/* The warning has to carry its own way out. Stating a problem whose fix
          is a long scroll further down the page is how a class ends up created
          but permanently unsellable. */}
      {activePlans.length === 0 ? (
        <Alert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>This class has no prices yet, so nobody can enrol in it.</span>
            <ButtonLink
              href={`/studio/offerings/${offering.id}/setup`}
              size="sm"
            >
              Add a price
            </ButtonLink>
          </div>
        </Alert>
      ) : null}

      <OfferingForm
        venues={venueRows}
        initial={{
          id: offering.id,
          title: offering.title,
          summary: offering.summary,
          description: offering.description,
          discipline: offering.discipline,
          type: offering.type,
          mode: offering.mode,
          level: offering.level,
          durationMin: offering.durationMin,
          capacity: offering.capacity,
          venueId: offering.venueId,
          isActive: offering.isActive,
        }}
      />

      <PlanEditor
        offeringId={offering.id}
        plans={offering.plans
          .filter((p) => p.isActive)
          .map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            amountRupees: paiseToRupees(p.amountPaise),
            sessionsIncluded: p.sessionsIncluded,
            validityDays: p.validityDays,
            description: p.description,
          }))}
      />

      {offering.isActive ? (
        <div className="border-t border-line pt-5">
          <ArchiveOfferingButton
            offeringId={offering.id}
            title={offering.title}
          />
        </div>
      ) : null}
    </div>
  );
}
