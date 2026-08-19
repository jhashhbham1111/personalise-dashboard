import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, ShieldAlert, Star } from "lucide-react";

import { listInstructorsForAdmin } from "@/lib/admin";
import { formatDate, formatRelative } from "@/lib/time";
import { pluralize } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { ModerationControls } from "./moderation-controls";

export const metadata: Metadata = { title: "Instructors · Admin" };

export default async function AdminInstructorsPage() {
  const admin = await requireAdmin();
  const instructors = await listInstructorsForAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instructors"
        description="Verify accounts, and suspend the ones that need it. Suspended and unverified accounts are listed first."
      />

      {instructors.length === 0 ? (
        <EmptyState
          title="No instructors yet"
          description="Anyone who signs up to teach appears here for review."
        />
      ) : (
        <Card className="divide-y divide-line">
          {instructors.map((i) => (
            <div key={i.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={i.name} src={i.avatarUrl} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/i/${i.slug}`}
                        className="font-medium text-ink hover:text-brand-700"
                      >
                        {i.name}
                      </Link>
                      {i.isSuspended ? (
                        <Badge tone="danger">
                          <ShieldAlert className="h-3 w-3" />
                          Suspended
                        </Badge>
                      ) : i.isVerified ? (
                        <Badge tone="success">
                          <BadgeCheck className="h-3 w-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge tone="warning">Unverified</Badge>
                      )}
                      {/* A suspended profile is hidden whatever its own
                          publish flag says, so showing "Published" next to
                          "Suspended" would misdescribe what students see. */}
                      {i.isSuspended ? (
                        <Badge tone="soft">Hidden</Badge>
                      ) : (
                        <Badge tone={i.isPublished ? "neutral" : "soft"}>
                          {i.isPublished ? "Published" : "Draft"}
                        </Badge>
                      )}
                      {i.ratingCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-ink-soft">
                          <Star className="h-3 w-3 fill-accent-500 text-accent-500" />
                          {(i.ratingAvg / 100).toFixed(1)} ({i.ratingCount})
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-0.5 truncate text-sm text-ink-soft">
                      {i.headline}
                    </p>

                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-faint">
                      <span>{i.email}</span>
                      {i.city ? <span>{i.city}</span> : null}
                      <span>{pluralize(Number(i.activeStudents), "active student")}</span>
                      <span>joined {formatRelative(i.createdAt)}</span>
                    </p>

                    {i.isSuspended && i.suspendedReason ? (
                      <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-xs text-danger-700">
                        <strong>
                          Suspended
                          {i.suspendedAt
                            ? ` on ${formatDate(i.suspendedAt, admin.timezone)}`
                            : ""}
                          :
                        </strong>{" "}
                        {i.suspendedReason}
                      </p>
                    ) : null}
                  </div>
                </div>

                <ModerationControls
                  instructor={{
                    id: i.id,
                    slug: i.slug,
                    name: i.name,
                    isVerified: i.isVerified,
                    isSuspended: i.isSuspended,
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-ink-faint">
        Suspending hides an instructor from search, their public page, the class
        directory and the video library, and blocks new bookings and payments.
        It deliberately leaves existing bookings and passes untouched — cancel
        individual classes if those shouldn&apos;t run.
      </p>
    </div>
  );
}
