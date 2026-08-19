import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { platformStats, recentModerationEvents } from "@/lib/admin";
import { env } from "@/lib/env";
import { MODERATION_ACTION_LABEL } from "@/lib/enums";
import { formatRelative } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionTitle, StatTile } from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin" };

const ACTION_TONE: Record<string, "success" | "danger" | "warning" | "soft"> = {
  VERIFIED: "success",
  UNVERIFIED: "warning",
  SUSPENDED: "danger",
  REINSTATED: "success",
};

export default async function AdminPage() {
  const user = await getCurrentUser();
  const [stats, events] = await Promise.all([
    platformStats(),
    recentModerationEvents(12),
  ]);

  const needsAttention = stats.unverified > 0 || stats.suspended > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello${user ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="Platform-wide numbers, instructor moderation and payouts."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students" value={stats.students} tone="brand" />
        <StatTile label="Instructors" value={stats.instructors} />
        <StatTile label="Class sessions" value={stats.sessions} />
        <StatTile
          label="Gross bookings"
          value={formatMoney(stats.grossPaise)}
          sub={`${formatMoney(stats.platformFeePaise)} platform fee at ${env.platformFeePercent}%`}
        />
      </div>

      {needsAttention ? (
        <section>
          <SectionTitle>Needs a decision</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.unverified > 0 ? (
              <Card className="flex items-center gap-3 p-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-accent-600" />
                <p className="flex-1 text-sm text-ink">
                  <strong>{stats.unverified}</strong>{" "}
                  {stats.unverified === 1 ? "instructor is" : "instructors are"} waiting
                  to be verified.
                </p>
                <ButtonLink href="/admin/instructors" size="sm" variant="secondary">
                  Review
                </ButtonLink>
              </Card>
            ) : null}
            {stats.suspended > 0 ? (
              <Card className="flex items-center gap-3 p-4">
                <ShieldAlert className="h-5 w-5 shrink-0 text-danger-600" />
                <p className="flex-1 text-sm text-ink">
                  <strong>{stats.suspended}</strong> suspended{" "}
                  {stats.suspended === 1 ? "account" : "accounts"}, hidden from the
                  public site.
                </p>
                <ButtonLink href="/admin/instructors" size="sm" variant="secondary">
                  View
                </ButtonLink>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle
          action={
            <Link
              href="/admin/instructors"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              All instructors →
            </Link>
          }
        >
          Recent moderation
        </SectionTitle>

        {events.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Verifications and suspensions are recorded here, with who did it and when."
          />
        ) : (
          <Card className="divide-y divide-line">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
                <Badge tone={ACTION_TONE[e.action] ?? "soft"}>
                  {MODERATION_ACTION_LABEL[e.action] ?? e.action}
                </Badge>
                <Link
                  href={`/i/${e.instructorSlug}`}
                  className="text-sm font-medium text-ink hover:text-brand-700"
                >
                  {e.instructorName}
                </Link>
                {e.note ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                    “{e.note}”
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <span className="shrink-0 text-xs text-ink-faint">
                  {e.adminName || "an admin"} · {formatRelative(e.createdAt)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
