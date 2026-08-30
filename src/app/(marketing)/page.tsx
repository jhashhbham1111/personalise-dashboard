import Link from "next/link";
import {
  CalendarDays,
  CreditCard,
  IndianRupee,
  MonitorPlay,
  Search,
  Users,
  Video,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { capabilities, liveCopy, paymentCopy } from "@/lib/capabilities";
import {
  enrolledOfferingIds,
  listInstructors,
  listUpcomingSessions,
  listVideos,
} from "@/lib/queries";
import { DISCIPLINES } from "@/lib/enums";
import { DEFAULT_TIMEZONE } from "@/lib/time";
import { InstructorCard } from "@/components/instructor-card";
import { SessionCard } from "@/components/session-card";
import { VideoCard } from "@/components/video-card";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function LandingPage() {
  const user = await getCurrentUser();
  const tz = user?.timezone ?? DEFAULT_TIMEZONE;

  const [instructors, sessions, videos, enrolledIds] = await Promise.all([
    listInstructors(),
    listUpcomingSessions({ limit: 6 }),
    listVideos({ viewerId: user?.id ?? null, limit: 3 }),
    user ? enrolledOfferingIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  const cardViewer = { signedIn: !!user, enrolledOfferingIds: enrolledIds };

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 opacity-[0.07] [background-image:radial-gradient(circle_at_15%_25%,#1f6650_0,transparent_45%),radial-gradient(circle_at_85%_15%,#e08c3a_0,transparent_40%)]" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
              Yoga · Music · Dance · Fitness · Anything you teach
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Learn from people who
              <br />
              actually teach.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
              Find an instructor, see their real schedule, book a seat, and turn
              up — without a single WhatsApp group or spreadsheet.
            </p>

            <form
              action="/instructors"
              className="mt-7 flex max-w-lg gap-2"
              role="search"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  name="q"
                  placeholder="Try “yoga”, “guitar”, or an instructor's name"
                  className="h-12 pl-9"
                  aria-label="Search instructors"
                />
              </div>
              <ButtonLink href="/instructors" size="lg" className="hidden sm:inline-flex">
                Browse
              </ButtonLink>
              <button type="submit" className="sr-only">
                Search
              </button>
            </form>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {DISCIPLINES.slice(0, 7).map((d) => (
                <Link
                  key={d}
                  href={`/instructors?discipline=${encodeURIComponent(d)}`}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-sm text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {d}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- upcoming classes */}
      <Section
        title="Happening soon"
        description="Live online and in person, across every discipline on the platform."
        href="/classes"
        linkLabel="All classes"
      >
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-soft">No classes scheduled yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                timezone={tz}
                viewer={cardViewer}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ---------------------------------------------------- instructors */}
      <Section
        title="Instructors taking students"
        description="Every profile is run by the person teaching the class."
        href="/instructors"
        linkLabel="All instructors"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.slice(0, 3).map((i) => (
            <InstructorCard key={i.id} instructor={i} />
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- videos */}
      {videos.length > 0 ? (
        <Section
          title="From the video library"
          description="Free lessons and vlogs. Class recordings unlock when you enrol."
          href="/videos"
          linkLabel="All videos"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ------------------------------------------------- teacher pitch */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-brand-200 bg-brand-800">
          <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold leading-tight text-white">
                Teach what you&rsquo;re good at.
                <br />
                We&rsquo;ll handle the admin.
              </h2>
              <p className="mt-4 text-brand-100">
                Publish your classes, set your own prices,{" "}
                {paymentCopy.instructor}, {liveCopy.instructor}, and keep every
                recording in one library. Setting up takes about ten minutes.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ButtonLink href="/signup?intent=teach" size="lg" variant="accent">
                  Start teaching
                </ButtonLink>
                <ButtonLink
                  href="/instructors"
                  size="lg"
                  variant="ghost"
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  See how others do it
                </ButtonLink>
              </div>
            </div>

            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  icon: CalendarDays,
                  title: "Recurring schedules",
                  body: "Set “Mon, Wed, Fri at 6:30am” once. Sessions generate themselves.",
                },
                {
                  icon: Users,
                  title: "Enrolments & waitlists",
                  body: "Class packs, monthly passes, automatic waitlist promotion.",
                },
                {
                  icon: IndianRupee,
                  title: capabilities.onlinePayments
                    ? "UPI-first payments"
                    : "Earnings, tracked",
                  body: paymentCopy.feature,
                },
                {
                  icon: MonitorPlay,
                  title: liveCopy.featureTitle,
                  body: liveCopy.featureBody,
                },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title}>
                    <dt className="flex items-center gap-2 font-medium text-white">
                      <Icon className="h-4.5 w-4.5 text-brand-300" />
                      {f.title}
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-brand-100">
                      {f.body}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- how it works */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-semibold text-ink">
          How booking works
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Search,
              title: "Find your instructor",
              body: "Filter by discipline, city, and whether you want online or in-person classes.",
            },
            {
              icon: CreditCard,
              title: "Pick a pass",
              body: `Drop in for one class, buy a pack, or go monthly. ${paymentCopy.short}`,
            },
            {
              icon: Video,
              title: "Show up",
              body: liveCopy.join,
            },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative">
                <span className="inline-grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-brand-700">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold text-ink">
                  <span className="text-ink-faint">{i + 1}. </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function Section({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-ink-soft">{description}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            {linkLabel} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
