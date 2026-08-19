import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { MapPin } from "lucide-react";

import { db, venues } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { VenueDialog } from "./venue-dialog";
import { DeleteVenueButton } from "./delete-venue-button";

export const metadata: Metadata = { title: "Venues" };

export default async function VenuesPage() {
  const user = await requireInstructor();

  const rows = await db.query.venues.findMany({
    where: and(
      eq(venues.instructorId, user.instructorProfileId),
      eq(venues.isActive, true),
    ),
    orderBy: [asc(venues.name)],
  });

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Venues"
        description="Where your in-person classes happen. Students see the full address and a map link on their booking."
        actions={<VenueDialog triggerLabel="Add a venue" showIcon />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title="No venues yet"
          description="Add one if you teach anywhere in person. Online-only classes don't need this."
          action={<VenueDialog triggerLabel="Add your first venue" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((v) => (
            <Card key={v.id} className="p-5">
              <h3 className="font-semibold text-ink">{v.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {v.addressLine}
                <br />
                {v.city}
                {v.state ? `, ${v.state}` : ""} {v.pincode}
              </p>
              {v.landmark ? (
                <p className="mt-1 text-sm text-ink-faint">{v.landmark}</p>
              ) : null}
              {v.mapUrl ? (
                <a
                  href={v.mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Map link
                </a>
              ) : null}

              <div className="mt-4 flex gap-2">
                <VenueDialog
                  venue={{
                    id: v.id,
                    name: v.name,
                    addressLine: v.addressLine,
                    city: v.city,
                    state: v.state,
                    pincode: v.pincode,
                    landmark: v.landmark,
                    mapUrl: v.mapUrl,
                  }}
                  triggerLabel="Edit"
                  triggerVariant="secondary"
                  triggerSize="sm"
                />
                <DeleteVenueButton venueId={v.id} name={v.name} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
