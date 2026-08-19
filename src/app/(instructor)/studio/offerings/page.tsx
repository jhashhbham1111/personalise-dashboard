import Link from "next/link";
import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { MapPin, Plus, Video } from "lucide-react";

import { db, offerings, pricingPlans } from "@/db";
import { requireInstructor } from "@/lib/auth";
import {
  LEVEL_LABEL,
  MODE_LABEL,
  OFFERING_TYPE_LABEL,
} from "@/lib/enums";
import { formatDuration } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Classes" };

export default async function OfferingsPage() {
  const user = await requireInstructor();

  const rows = await db.query.offerings.findMany({
    where: eq(offerings.instructorId, user.instructorProfileId),
    with: {
      plans: { orderBy: [asc(pricingPlans.sortOrder)] },
      venue: true,
      scheduleRules: { columns: { id: true, isActive: true } },
    },
    orderBy: [desc(offerings.createdAt)],
  });

  const active = rows.filter((o) => o.isActive);
  const archived = rows.filter((o) => !o.isActive);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Classes"
        description="What you teach, who it's for, and what it costs."
        actions={
          <ButtonLink href="/studio/offerings/new">
            <Plus className="h-4 w-4" />
            New class
          </ButtonLink>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          title="No classes yet"
          description="A class is the thing students enrol in — a weekly flow, an eight-week course, a private lesson. Add one to get going."
          action={
            <ButtonLink href="/studio/offerings/new">
              Add your first class
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((o) => {
            const activePlans = o.plans.filter((p) => p.isActive);
            const cheapest = activePlans.reduce<number | null>(
              (min, p) => (min === null || p.amountPaise < min ? p.amountPaise : min),
              null,
            );
            const hasSchedule = o.scheduleRules.some((r) => r.isActive);

            return (
              <Card key={o.id} className="flex flex-col">
                <Link
                  href={`/studio/offerings/${o.id}`}
                  className="flex flex-1 flex-col p-5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="soft">
                      {OFFERING_TYPE_LABEL[o.type] ?? o.type}
                    </Badge>
                    <Badge tone={o.mode === "ONLINE" ? "info" : "warning"}>
                      {o.mode === "ONLINE" ? (
                        <Video className="h-3 w-3" />
                      ) : (
                        <MapPin className="h-3 w-3" />
                      )}
                      {MODE_LABEL[o.mode]}
                    </Badge>
                    <Badge>{o.discipline}</Badge>
                  </div>

                  <h3 className="mt-2.5 font-semibold text-ink">{o.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                    {o.summary}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
                    <span>{formatDuration(o.durationMin)}</span>
                    <span>{LEVEL_LABEL[o.level] ?? o.level}</span>
                    <span>
                      {o.capacity === 1 ? "Private" : `Up to ${o.capacity}`}
                    </span>
                    {o.venue ? <span>{o.venue.name}</span> : null}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {cheapest !== null ? (
                      <span className="text-sm text-ink-soft">
                        From{" "}
                        <span className="font-semibold text-ink">
                          {formatMoney(cheapest)}
                        </span>
                      </span>
                    ) : (
                      <Badge tone="danger">No prices set</Badge>
                    )}
                    {!hasSchedule ? (
                      <Badge tone="warning">No schedule</Badge>
                    ) : null}
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {archived.length > 0 ? (
        <section>
          <SectionTitle>Archived</SectionTitle>
          <Card className="divide-y divide-line">
            {archived.map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-soft">{o.title}</p>
                  <p className="truncate text-xs text-ink-faint">{o.summary}</p>
                </div>
                <ButtonLink
                  href={`/studio/offerings/${o.id}`}
                  size="sm"
                  variant="secondary"
                >
                  Restore
                </ButtonLink>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
