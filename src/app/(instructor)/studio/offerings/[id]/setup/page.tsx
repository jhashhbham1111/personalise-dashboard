import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Check, IndianRupee, CalendarClock, Sparkles } from "lucide-react";

import {
  db,
  offerings,
  pricingPlans,
  scheduleRules,
  venues,
} from "@/db";
import { requireInstructor } from "@/lib/auth";
import { describeDays } from "@/lib/recurrence";
import { formatMinutesOfDay, toDateInput } from "@/lib/time";
import { cn, paiseToRupees } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { PlanEditor } from "../plan-editor";
import { RuleDialog } from "../../../schedule/rule-dialog";

export const metadata: Metadata = { title: "Set up class" };

/**
 * The three things a class needs before anyone can book it: details, a price,
 * and a time. Creating a class used to drop the instructor on the edit page
 * with a warning that said "no prices yet" while the price editor sat below a
 * long form, off-screen, and the schedule lived on an entirely different tab.
 * This walks through all three in order and refuses to declare the class ready
 * until each one is genuinely done.
 */
export default async function OfferingSetupPage({
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

  const [rules, venueRows] = await Promise.all([
    db.query.scheduleRules.findMany({
      where: and(
        eq(scheduleRules.offeringId, offering.id),
        eq(scheduleRules.isActive, true),
      ),
    }),
    db
      .select({ id: venues.id, name: venues.name, city: venues.city })
      .from(venues)
      .where(
        and(
          eq(venues.instructorId, user.instructorProfileId),
          eq(venues.isActive, true),
        ),
      ),
  ]);

  const activePlans = offering.plans.filter((p) => p.isActive);
  const hasPrices = activePlans.length > 0;
  const hasSchedule = rules.length > 0;
  const ready = hasPrices && hasSchedule;

  const offeringOption = [
    {
      id: offering.id,
      title: offering.title,
      mode: offering.mode,
      durationMin: offering.durationMin,
    },
  ];

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
        title={`Set up ${offering.title}`}
        description="Three steps and students can start booking."
      />

      <ol className="flex items-center gap-2 text-sm">
        <Step label="Details" done />
        <Divider />
        <Step label="Price" done={hasPrices} current={!hasPrices} />
        <Divider />
        <Step
          label="Schedule"
          done={hasSchedule}
          current={hasPrices && !hasSchedule}
        />
      </ol>

      {/* ------------------------------------------------------- step two */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <IndianRupee className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-ink">2. What does it cost?</h2>
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          Add at least one pass. A drop-in for one class is the simplest place
          to start — you can add packs and monthly passes later.
        </p>
        <PlanEditor
          offeringId={offering.id}
          plans={activePlans.map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            amountRupees: paiseToRupees(p.amountPaise),
            sessionsIncluded: p.sessionsIncluded,
            validityDays: p.validityDays,
            description: p.description,
          }))}
        />
      </section>

      {/* ----------------------------------------------------- step three */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-brand-600" />
          <h2 className="font-semibold text-ink">3. When does it run?</h2>
        </div>

        {!hasPrices ? (
          <Card className="p-5 text-sm text-ink-soft">
            Add a pass above first — there&rsquo;s no point scheduling a class nobody
            can pay for.
          </Card>
        ) : hasSchedule ? (
          <Card className="p-5">
            <ul className="space-y-2">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="text-ink">
                    {describeDays(r.daysOfWeek)} at{" "}
                    {formatMinutesOfDay(r.startTimeMinutes)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <RuleDialog
                offerings={offeringOption}
                venues={venueRows}
                defaultStartDate={toDateInput(new Date(), user.timezone)}
                timezone={user.timezone}
                triggerLabel="Add another time"
                triggerVariant="secondary"
                triggerSize="sm"
              />
              <ButtonLink href="/studio/schedule" variant="ghost" size="sm">
                Manage in Schedule
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <p className="text-sm text-ink-soft">
              Set a repeating pattern once — &ldquo;Mon, Wed, Fri at
              6:30am&rdquo; — and dated classes generate themselves for the next
              60 days.
            </p>
            <div className="mt-4">
              <RuleDialog
                offerings={offeringOption}
                venues={venueRows}
                defaultStartDate={toDateInput(new Date(), user.timezone)}
                timezone={user.timezone}
                triggerLabel="Set a class time"
              />
            </div>
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------------ done */}
      {ready ? (
        <Card className="border-brand-200 bg-brand-50 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold text-ink">
                {offering.title} is ready to book.
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                It&rsquo;s priced and scheduled. If your public page is published,
                students can find and book it now.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/studio/offerings">Back to classes</ButtonLink>
                {user.instructorSlug ? (
                  <ButtonLink
                    href={`/i/${user.instructorSlug}/enrol/${offering.slug}`}
                    variant="secondary"
                  >
                    Preview it
                  </ButtonLink>
                ) : null}
                <ButtonLink
                  href={`/studio/offerings/${offering.id}`}
                  variant="ghost"
                >
                  Edit details
                </ButtonLink>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <p className="text-sm text-ink-faint">
          You can leave and come back &mdash; everything is saved as you go.
        </p>
      )}
    </div>
  );
}

function Step({
  label,
  done,
  current,
}: {
  label: string;
  done?: boolean;
  current?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1",
        done
          ? "bg-brand-100 text-brand-800"
          : current
            ? "bg-surface text-ink ring-1 ring-brand-300"
            : "text-ink-faint",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : null}
      {label}
    </li>
  );
}

function Divider() {
  return <li aria-hidden className="h-px w-4 bg-line-strong" />;
}
