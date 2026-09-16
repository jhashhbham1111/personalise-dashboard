import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { CalendarDays, Clock, MapPin, Users, Video } from "lucide-react";

import { bookings, db, enrollments } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { sessionAvailability } from "@/lib/booking";
import { getSessionDetail } from "@/lib/queries";
import {
  BookingStatus,
  EnrollmentStatus,
  LEVEL_LABEL,
  MODE_LABEL,
  OFFERING_TYPE_LABEL,
  SessionStatus,
} from "@/lib/enums";
import { instructorIsPublic } from "@/lib/instructor-visibility";
import { sessionEventJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import {
  DEFAULT_TIMEZONE,
  formatDuration,
  formatLongDate,
  formatRelative,
  formatTime,
} from "@/lib/time";
import { Avatar } from "@/components/ui/avatar";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/page";
import { BookingPanel } from "./booking-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await getSessionDetail(id);
  if (!row) return { title: "Class not found" };

  const where = row.venue?.city || row.instructor.city?.trim();
  const title = where
    ? `${row.session.title} — ${where}`
    : `${row.session.title} with ${row.instructorName}`;

  const description = [
    row.offering.summary?.trim(),
    `A ${row.offering.durationMin} minute ${row.offering.discipline} class with ${row.instructorName}`,
    where ? `in ${where}.` : "online.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);

  return {
    title,
    description,
    alternates: { canonical: `/classes/${id}` },
    /*
     * A session page is worth indexing only while it can still be booked.
     * Once it's past, it's a dated duplicate of a class that runs weekly —
     * exactly the kind of page that fills an index with results nobody can
     * act on. `follow` stays on either way, so the crawler still walks
     * through to the instructor and class pages, which don't expire.
     */
    robots:
      row.session.startsAt.getTime() > Date.now()
        ? undefined
        : { index: false, follow: true },
    openGraph: { type: "website", title, description, url: `/classes/${id}` },
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getSessionDetail(id);
  if (!row) notFound();

  const viewer = await getCurrentUser();
  const tz = viewer?.timezone ?? DEFAULT_TIMEZONE;
  const { session, offering, instructor, instructorName, instructorAvatar, venue } = row;

  const availability = await sessionAvailability(session.id);

  const existingBooking = viewer
    ? await db.query.bookings.findFirst({
        where: and(
          eq(bookings.sessionId, session.id),
          eq(bookings.studentId, viewer.id),
        ),
      })
    : null;

  const activeEnrollment = viewer
    ? await db.query.enrollments.findFirst({
        where: and(
          eq(enrollments.studentId, viewer.id),
          eq(enrollments.offeringId, offering.id),
          eq(enrollments.status, EnrollmentStatus.ACTIVE),
        ),
      })
    : null;

  const durationMin = Math.round(
    (session.endsAt.getTime() - session.startsAt.getTime()) / 60000,
  );
  const now = new Date();
  const isPast = session.endsAt < now;

  /*
   * A pass being ACTIVE isn't the same as it being usable. `bookSession` also
   * rejects an expired one and one with no credits left, but this page only
   * checked the status — so someone whose pass had run out saw a live "Book my
   * place" button, clicked it, and got an error. Working out *why* they can't
   * book here means the panel can say the useful thing (top up / renew)
   * instead of the button lying and then failing.
   */
  const passExpired =
    !!activeEnrollment?.expiresAt && activeEnrollment.expiresAt < now;
  const passSpent =
    activeEnrollment != null &&
    activeEnrollment.sessionsRemaining !== null &&
    activeEnrollment.sessionsRemaining <= 0;
  const passProblem: "expired" | "spent" | null = !activeEnrollment
    ? null
    : passExpired
      ? "expired"
      : passSpent
        ? "spent"
        : null;
  const canBook = !!activeEnrollment && passProblem === null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/*
        Event markup only while the class is still ahead and the instructor is
        public. Describing a past class as a scheduled event is the kind of
        mismatch between markup and page that costs rich results sitewide.
      */}
      {!isPast && instructorIsPublic(instructor) ? (
        <JsonLd
          data={sessionEventJsonLd({
            id: session.id,
            title: session.title,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            mode: session.mode,
            instructorName,
            instructorSlug: instructor.slug,
            venue: venue
              ? {
                  name: venue.name,
                  addressLine: venue.addressLine,
                  city: venue.city,
                }
              : null,
            isCancelled: session.status === SessionStatus.CANCELLED,
          })}
        />
      ) : null}

      <nav className="mb-5 text-sm text-ink-soft">
        <Link href="/classes" className="hover:text-brand-700">
          Classes
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <Link href={`/i/${instructor.slug}`} className="hover:text-brand-700">
          {instructorName}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <SessionStatusBadge status={session.status} />
            <Badge tone="soft">
              {OFFERING_TYPE_LABEL[offering.type] ?? offering.type}
            </Badge>
            <Badge tone={session.mode === "ONLINE" ? "info" : "warning"}>
              {session.mode === "ONLINE" ? (
                <Video className="h-3 w-3" />
              ) : (
                <MapPin className="h-3 w-3" />
              )}
              {MODE_LABEL[session.mode]}
            </Badge>
          </div>

          <h1 className="mt-3 text-3xl font-semibold text-ink">{session.title}</h1>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Fact icon={CalendarDays} label="Date">
              {formatLongDate(session.startsAt, tz)}
            </Fact>
            <Fact icon={Clock} label="Time">
              {formatTime(session.startsAt, tz)} – {formatTime(session.endsAt, tz)}
              <span className="ml-1.5 text-ink-faint">
                ({formatDuration(durationMin)})
              </span>
            </Fact>
            <Fact icon={Users} label="Seats">
              {availability.isFull
                ? `Full — ${availability.capacity} booked`
                : `${availability.seatsLeft} of ${availability.capacity} left`}
            </Fact>
            <Fact icon={Video} label="Level">
              {LEVEL_LABEL[offering.level] ?? offering.level}
            </Fact>
          </div>

          {session.status === "CANCELLED" && session.cancelReason ? (
            <Alert tone="danger" className="mt-5">
              <strong>This class was cancelled.</strong> {session.cancelReason}
            </Alert>
          ) : null}

          {venue ? (
            <Card className="mt-6 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                Where
              </h2>
              <p className="mt-2 font-medium text-ink">{venue.name}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {venue.addressLine}
                <br />
                {venue.city}
                {venue.state ? `, ${venue.state}` : ""} {venue.pincode}
              </p>
              {venue.landmark ? (
                <p className="mt-1 text-sm text-ink-faint">{venue.landmark}</p>
              ) : null}
              {venue.mapUrl ? (
                <a
                  href={venue.mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  Open in maps
                </a>
              ) : null}
            </Card>
          ) : null}

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              About this class
            </h2>
            <p className="mt-2 leading-relaxed text-ink-soft">{offering.summary}</p>
            <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">
              {offering.description.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>

          <Link
            href={`/i/${instructor.slug}`}
            className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300"
          >
            <Avatar name={instructorName} src={instructorAvatar} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{instructorName}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                {instructor.headline}
              </p>
            </div>
          </Link>
        </div>

        {/* ------------------------------------------------ booking panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            {isPast ? (
              <div>
                <p className="font-semibold text-ink">This class has finished</p>
                <p className="mt-1 text-sm text-ink-soft">
                  It ran {formatRelative(session.endsAt)}.
                </p>
                <ButtonLink
                  href={`/classes?instructor=${instructor.slug}`}
                  block
                  className="mt-4"
                >
                  See upcoming classes
                </ButtonLink>
              </div>
            ) : (
              <BookingPanel
                sessionId={session.id}
                offeringSlug={offering.slug}
                instructorSlug={instructor.slug}
                isSignedIn={!!viewer}
                isFull={availability.isFull}
                seatsLeft={availability.seatsLeft}
                cancelled={session.status === "CANCELLED"}
                existingStatus={
                  existingBooking && existingBooking.status !== BookingStatus.CANCELLED
                    ? existingBooking.status
                    : null
                }
                waitlistPosition={existingBooking?.waitlistPosition ?? null}
                hasEnrollment={canBook}
                passProblem={passProblem}
                sessionsRemaining={activeEnrollment?.sessionsRemaining ?? null}
                startsAt={session.startsAt}
                endsAt={session.endsAt}
                status={session.status}
                mode={session.mode}
              />
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm text-ink">{children}</p>
    </div>
  );
}
