import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { studentBookings } from "@/lib/queries";
import { BookingRow } from "@/components/booking-row";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "My bookings" };

export default async function BookingsPage() {
  const user = await requireUser("/dashboard/bookings");

  const [upcoming, past] = await Promise.all([
    studentBookings(user.id, { upcoming: true }),
    studentBookings(user.id, { upcoming: false, limit: 25 }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="My bookings"
        description="Everything you've booked, past and future."
        actions={<ButtonLink href="/classes">Book another class</ButtonLink>}
      />

      <section>
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="Nothing booked yet"
            description="Find a class and grab a seat."
            action={<ButtonLink href="/classes">Browse classes</ButtonLink>}
          />
        ) : (
          <div className="space-y-2">
            {upcoming.map((row) => (
              <BookingRow key={row.booking.id} row={row} timezone={user.timezone} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <SectionTitle>Past classes</SectionTitle>
          <div className="space-y-2">
            {past.map((row) => (
              <BookingRow
                key={row.booking.id}
                row={row}
                timezone={user.timezone}
                showCancel={false}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
