import Link from "next/link";
import { MapPin, Users, Video } from "lucide-react";

import {
  LEVEL_LABEL,
  MODE_LABEL,
  OFFERING_TYPE_LABEL,
  PLAN_KIND_LABEL,
} from "@/lib/enums";
import { formatDuration } from "@/lib/time";
import { formatMoney, pluralize } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { ButtonLink } from "./ui/button";
import { Card } from "./ui/card";

type OfferingWithPlans = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  discipline: string;
  type: string;
  mode: string;
  level: string;
  durationMin: number;
  capacity: number;
  plans: {
    id: string;
    name: string;
    kind: string;
    amountPaise: number;
    sessionsIncluded: number | null;
    validityDays: number | null;
    description: string | null;
  }[];
  venue: { name: string; city: string } | null;
};

export function OfferingCard({
  offering,
  instructorSlug,
}: {
  offering: OfferingWithPlans;
  instructorSlug: string;
}) {
  // Lead with the cheapest way in — that's the number people compare on.
  const cheapest = offering.plans.reduce<OfferingWithPlans["plans"][number] | null>(
    (min, p) => (!min || p.amountPaise < min.amountPaise ? p : min),
    null,
  );

  return (
    <Card className="flex flex-col">
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="soft">
            {OFFERING_TYPE_LABEL[offering.type] ?? offering.type}
          </Badge>
          <Badge tone={offering.mode === "ONLINE" ? "info" : "warning"}>
            {offering.mode === "ONLINE" ? (
              <Video className="h-3 w-3" />
            ) : (
              <MapPin className="h-3 w-3" />
            )}
            {MODE_LABEL[offering.mode]}
          </Badge>
        </div>

        <h3 className="mt-2.5 font-semibold leading-snug text-ink">
          {offering.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">
          {offering.summary}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
          <span>{formatDuration(offering.durationMin)}</span>
          <span>{LEVEL_LABEL[offering.level] ?? offering.level}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {offering.capacity === 1
              ? "Private"
              : `Up to ${offering.capacity}`}
          </span>
        </div>

        {offering.venue ? (
          <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-ink-soft">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {offering.venue.name}, {offering.venue.city}
          </p>
        ) : null}

        {/* Pricing */}
        {offering.plans.length > 0 ? (
          <div className="mt-4 rounded-lg border border-line bg-paper p-3">
            <ul className="space-y-1.5">
              {offering.plans.slice(0, 3).map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-ink-soft">
                    {p.name}
                    <span className="ml-1.5 text-xs text-ink-faint">
                      {p.sessionsIncluded === null
                        ? PLAN_KIND_LABEL[p.kind]
                        : pluralize(p.sessionsIncluded, "class", "classes")}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">
                    {formatMoney(p.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          {cheapest ? (
            <span className="text-sm text-ink-soft">
              From{" "}
              <span className="font-semibold text-ink">
                {formatMoney(cheapest.amountPaise)}
              </span>
            </span>
          ) : (
            <span />
          )}
          <ButtonLink
            href={`/i/${instructorSlug}/enrol/${offering.slug}`}
            size="sm"
          >
            Enrol
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/** Compact variant used in the student dashboard's enrolment list. */
export function OfferingSummaryLink({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-line bg-surface p-3 transition-colors hover:border-brand-300"
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>
    </Link>
  );
}
