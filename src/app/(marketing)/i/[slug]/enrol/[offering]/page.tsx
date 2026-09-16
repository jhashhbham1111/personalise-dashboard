import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { CalendarDays, Check, MapPin, Users } from "lucide-react";

import { db, enrollments, offerings } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getInstructorBySlug, listUpcomingSessions } from "@/lib/queries";
import {
  EnrollmentStatus,
  LEVEL_LABEL,
  MODE_LABEL,
  OFFERING_TYPE_LABEL,
} from "@/lib/enums";
import {
  breadcrumbJsonLd,
  courseJsonLd,
  endSentence,
} from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { env } from "@/lib/env";
import {
  canPreviewInstructor,
  instructorIsPublic,
  visibilityReason,
} from "@/lib/instructor-visibility";
import { hasPaymentDetails, upiQrDataUri } from "@/lib/payment-details";
import { DEFAULT_TIMEZONE, formatDuration } from "@/lib/time";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/page";
import { SessionCard } from "@/components/session-card";
import { PreviewBanner } from "@/components/preview-banner";
import { PlanPicker } from "./plan-picker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; offering: string }>;
}): Promise<Metadata> {
  const { slug, offering: offeringSlug } = await params;

  // This used to return the raw URL slug as the title, so the page that is
  // meant to sell a class advertised itself to Google as "Enrol — test3".
  const row = await getInstructorBySlug(slug);
  if (!row) return { title: "Class not found" };

  const found = await db.query.offerings.findFirst({
    where: and(
      eq(offerings.instructorId, row.profile.id),
      eq(offerings.slug, offeringSlug),
    ),
    with: { venue: true },
  });
  if (!found) return { title: "Class not found" };

  const where = found.venue?.city || row.profile.city?.trim();
  const title = where
    ? `${found.title} with ${row.user.name} — ${where}`
    : `${found.title} with ${row.user.name}`;

  const description = [
    endSentence(found.summary || found.description?.slice(0, 160)),
    endSentence(
      `${found.durationMin} minute ${MODE_LABEL[found.mode]?.toLowerCase() ?? ""} ${found.discipline} class${where ? ` in ${where}` : ""}`.replace(
        /\s+/g,
        " ",
      ),
    ),
    "Book online on Personalise.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);

  return {
    title,
    description,
    alternates: { canonical: `/i/${slug}/enrol/${offeringSlug}` },
    robots: instructorIsPublic(row.profile) ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/i/${slug}/enrol/${offeringSlug}`,
      images: found.coverImageUrl ? [{ url: found.coverImageUrl }] : undefined,
    },
  };
}

export default async function EnrolPage({
  params,
}: {
  params: Promise<{ slug: string; offering: string }>;
}) {
  const { slug, offering: offeringSlug } = await params;

  const row = await getInstructorBySlug(slug);
  if (!row) notFound();

  const viewerForGate = await getCurrentUser();

  /*
   * This page had no visibility check at all — an unpublished or suspended
   * instructor's price list was reachable by direct link, and would happily
   * take an enrolment. Same rule as the profile page it hangs off.
   */
  const isPublic = instructorIsPublic(row.profile);
  const preview = !isPublic && canPreviewInstructor(row.profile, viewerForGate);
  if (!isPublic && !preview) notFound();

  const offering = await db.query.offerings.findFirst({
    where: and(
      eq(offerings.instructorId, row.profile.id),
      eq(offerings.slug, offeringSlug),
    ),
    with: {
      plans: { orderBy: (p, { asc }) => [asc(p.sortOrder)] },
      venue: true,
    },
  });
  if (!offering) notFound();

  const viewer = viewerForGate;
  const tz = viewer?.timezone ?? DEFAULT_TIMEZONE;

  const existing = viewer
    ? await db.query.enrollments.findFirst({
        where: and(
          eq(enrollments.studentId, viewer.id),
          eq(enrollments.offeringId, offering.id),
          eq(enrollments.status, EnrollmentStatus.ACTIVE),
        ),
      })
    : null;

  const upcoming = await listUpcomingSessions({
    offeringId: offering.id,
    limit: 4,
  });

  // `existing` is this offering's enrolment specifically, which is all the
  // cards on this page need — they're all sessions of this same class.
  const cardViewer = {
    signedIn: !!viewer,
    enrolledOfferingIds: new Set(existing ? [offering.id] : []),
  };

  const activePlans = offering.plans.filter((p) => p.isActive);

  /*
   * Only assembled when online payments are off — that's the only mode where
   * the student pays the instructor directly and therefore needs to know how.
   * The QR is rendered here rather than stored, so it can never drift from the
   * UPI ID beside it.
   */
  const details = {
    upiId: row.profile.upiId,
    bankDetails: row.profile.bankDetails,
    paymentNote: row.profile.paymentNote,
  };
  const payment =
    !env.onlinePayments && hasPaymentDetails(details)
      ? {
          ...details,
          upiQrDataUri: details.upiId
            ? await upiQrDataUri(details.upiId, row.user.name)
            : null,
        }
      : null;

  // "from ₹X" — the cheapest pass a student could actually buy today.
  const lowestAmountPaise = activePlans.length
    ? Math.min(...activePlans.map((p) => p.amountPaise))
    : null;

  return (
    <div>
      {isPublic ? (
        <JsonLd
          data={[
            courseJsonLd({
              title: offering.title,
              summary: offering.summary,
              description: offering.description,
              instructorName: row.user.name,
              instructorSlug: slug,
              offeringSlug,
              mode: offering.mode,
              durationMin: offering.durationMin,
              // The label, not the enum: "ALL_LEVELS" is a database value,
              // "All levels" is what a person reading a result understands.
              level: LEVEL_LABEL[offering.level] ?? offering.level,
              lowestAmountPaise,
              city: row.profile.city,
              venue: offering.venue
                ? {
                    name: offering.venue.name,
                    addressLine: offering.venue.addressLine,
                    city: offering.venue.city,
                  }
                : null,
            }),
            breadcrumbJsonLd([
              { name: "Instructors", path: "/instructors" },
              { name: row.user.name, path: `/i/${slug}` },
              { name: offering.title, path: `/i/${slug}/enrol/${offeringSlug}` },
            ]),
          ]}
        />
      ) : null}

      {preview ? (
        <PreviewBanner
          reason={visibilityReason(row.profile) ?? "Not visible to students."}
        />
      ) : null}
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <nav className="mb-5 text-sm text-ink-soft">
          <Link href={`/i/${slug}`} className="hover:text-brand-700">
            {row.user.name}
          </Link>
          <span className="mx-2 text-ink-faint">/</span>
          <span>Enrol</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="soft">
                {OFFERING_TYPE_LABEL[offering.type] ?? offering.type}
              </Badge>
              <Badge tone={offering.mode === "ONLINE" ? "info" : "warning"}>
                {MODE_LABEL[offering.mode]}
              </Badge>
              <Badge>{offering.discipline}</Badge>
            </div>

            <h1 className="mt-3 text-3xl font-semibold text-ink">
              {offering.title}
            </h1>
            <p className="mt-2 text-lg leading-relaxed text-ink-soft">
              {offering.summary}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
              <span>{formatDuration(offering.durationMin)} per class</span>
              <span>{LEVEL_LABEL[offering.level] ?? offering.level}</span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {offering.capacity === 1
                  ? "Private session"
                  : `Up to ${offering.capacity} students`}
              </span>
            </div>

            {offering.venue ? (
              <p className="mt-3 inline-flex items-start gap-2 text-sm text-ink-soft">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {offering.venue.name}
                  <span className="block text-ink-faint">
                    {offering.venue.addressLine}, {offering.venue.city}
                  </span>
                </span>
              </p>
            ) : null}

            <div className="mt-6 space-y-3 leading-relaxed text-ink-soft">
              {offering.description.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <Link
              href={`/i/${slug}`}
              className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300"
            >
              <Avatar name={row.user.name} src={row.user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-ink">{row.user.name}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                  {row.profile.headline}
                </p>
              </div>
            </Link>

            {upcoming.length > 0 ? (
              <section className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  <CalendarDays className="h-4 w-4" />
                  Next few sessions
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {upcoming.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      timezone={tz}
                      showInstructor={false}
                      viewer={cardViewer}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* ---------------------------------------------------- plan picker */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {existing ? (
              <Card className="p-5">
                <p className="inline-flex items-center gap-2 font-semibold text-brand-700">
                  <Check className="h-5 w-5" />
                  You&rsquo;re already enrolled
                </p>
                <p className="mt-1.5 text-sm text-ink-soft">
                  {existing.sessionsRemaining === null
                    ? "Your pass covers unlimited classes."
                    : `${existing.sessionsRemaining} session${existing.sessionsRemaining === 1 ? "" : "s"} left on your pass.`}
                </p>
                <ButtonLink
                  href={`/classes?instructor=${slug}`}
                  block
                  className="mt-4"
                >
                  Book a session
                </ButtonLink>
                <ButtonLink
                  href="/dashboard"
                  variant="secondary"
                  block
                  className="mt-2"
                >
                  My dashboard
                </ButtonLink>
              </Card>
            ) : activePlans.length === 0 ? (
              <Card className="p-5">
                <Alert tone="warning">
                  This class doesn&rsquo;t have any passes on sale right now.
                </Alert>
              </Card>
            ) : (
              <PlanPicker
                plans={activePlans.map((p) => ({
                  id: p.id,
                  name: p.name,
                  kind: p.kind,
                  amountPaise: p.amountPaise,
                  sessionsIncluded: p.sessionsIncluded,
                  validityDays: p.validityDays,
                  description: p.description,
                }))}
                isSignedIn={!!viewer}
                returnTo={`/i/${slug}/enrol/${offeringSlug}`}
                onlinePayments={env.onlinePayments}
                instructorName={row.user.name}
                payment={payment}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
