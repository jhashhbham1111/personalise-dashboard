import Link from "next/link";

import { requireInstructor } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { StudioTabs } from "./studio-tabs";

/**
 * The six things an instructor does week to week. Set-up-once and occasional
 * sections (profile, venues, videos, updates, analytics) live in the account
 * menu at top right instead of competing for space in this row.
 */
export const TABS = [
  { href: "/studio", label: "Overview" },
  { href: "/studio/offerings", label: "Classes" },
  { href: "/studio/schedule", label: "Schedule" },
  { href: "/studio/students", label: "Students" },
  { href: "/studio/messages", label: "Messages" },
  { href: "/studio/payments", label: "Earnings" },
  { href: "/studio/codes", label: "Pass codes" },
];

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireInstructor();

  return (
    <div className="min-h-screen">
      <div className="print:hidden">
        <SiteHeader homeHref="/studio" showPublicNav={false} />
      </div>

      {/* print:hidden so the pass-code print sheet comes out as codes, not as
          codes wrapped in navigation. */}
      <div className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Teaching studio
            </p>
            {user.instructorSlug ? (
              <Link
                href={`/i/${user.instructorSlug}`}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                View public page →
              </Link>
            ) : null}
          </div>
          <StudioTabs tabs={TABS} />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
