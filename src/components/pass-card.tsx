import Link from "next/link";
import { Infinity as InfinityIcon } from "lucide-react";

import { PLAN_KIND_LABEL } from "@/lib/enums";
import { formatDate } from "@/lib/time";
import { pluralize } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { ButtonLink } from "./ui/button";
import { Card } from "./ui/card";

type Enrolment = {
  id: string;
  status: string;
  sessionsRemaining: number | null;
  expiresAt: Date | null;
  offering: { id: string; title: string; slug: string; discipline: string };
  plan: { name: string; kind: string; sessionsIncluded: number | null } | null;
  instructor: { slug: string; user: { name: string } };
};

export function PassCard({
  enrolment,
  timezone,
  now,
}: {
  enrolment: Enrolment;
  timezone: string;
  /** Passed in so every card on a page shares one clock and render stays pure. */
  now: Date;
}) {
  const unlimited = enrolment.sessionsRemaining === null;
  const remaining = enrolment.sessionsRemaining ?? 0;
  const total = enrolment.plan?.sessionsIncluded ?? null;
  const pct = total ? Math.round((remaining / total) * 100) : 100;

  const expiringSoon =
    enrolment.expiresAt &&
    enrolment.expiresAt.getTime() - now.getTime() < 7 * 24 * 3600_000;
  const lowCredits = !unlimited && remaining <= 2;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/i/${enrolment.instructor.slug}/enrol/${enrolment.offering.slug}`}
            className="font-medium leading-snug text-ink hover:text-brand-700"
          >
            {enrolment.offering.title}
          </Link>
          <p className="mt-0.5 text-xs text-ink-soft">
            {enrolment.instructor.user.name}
          </p>
        </div>
        {enrolment.status !== "ACTIVE" ? (
          <Badge tone="soft">{enrolment.status.toLowerCase()}</Badge>
        ) : null}
      </div>

      <div className="mt-3">
        {unlimited ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <InfinityIcon className="h-4 w-4" />
            Unlimited classes
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span
                className={
                  lowCredits
                    ? "font-semibold text-accent-700"
                    : "font-semibold text-ink"
                }
              >
                {pluralize(remaining, "session")}
              </span>
              <span className="text-ink-soft"> left</span>
            </p>
            {total ? (
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-valuenow={remaining}
                aria-valuemin={0}
                aria-valuemax={total}
              >
                <div
                  className={
                    lowCredits
                      ? "h-full rounded-full bg-accent-500"
                      : "h-full rounded-full bg-brand-500"
                  }
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        {enrolment.plan?.name ?? PLAN_KIND_LABEL.PER_SESSION}
        {enrolment.expiresAt ? (
          <>
            {" · "}
            <span className={expiringSoon ? "text-accent-700" : undefined}>
              {enrolment.expiresAt < now ? "Expired" : "Expires"}{" "}
              {formatDate(enrolment.expiresAt, timezone)}
            </span>
          </>
        ) : null}
      </p>

      <div className="mt-auto pt-3">
        <ButtonLink
          href={`/classes?instructor=${enrolment.instructor.slug}`}
          size="sm"
          variant="secondary"
          block
        >
          Book a session
        </ButtonLink>
      </div>
    </Card>
  );
}
