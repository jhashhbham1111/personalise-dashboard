import Link from "next/link";

import { requireInstructor } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { StudioTabs } from "./studio-tabs";

/**
 * The six things an instructor does week to week. Eleven tabs in one scrolling
 * row meant the ones that matter daily sat alongside ones opened twice a year,
 * and on a laptop the last few were off-screen entirely.
 */
export const TABS = [
  { href: "/studio", label: "Overview" },
  { href: "/studio/offerings", label: "Classes" },
  { href: "/studio/schedule", label: "Schedule" },
  { href: "/studio/students", label: "Students" },
  { href: "/studio/payments", label: "Fees" },
  { href: "/studio/codes", label: "Pass codes" },
];

/**
 * Set-up-once and occasional sections, behind a "More" menu.
 *
 * Notifications keeps its own entry here even though the header bell reaches
 * the same page — the bell is easy to miss, and losing the only path to it
 * would be worse than one extra menu item.
 */
export const MORE_TABS = [
  { href: "/studio/profile", label: "My profile" },
  { href: "/studio/venues", label: "Venues" },
  { href: "/studio/media", label: "Videos" },
  { href: "/studio/updates", label: "Updates" },
  { href: "/studio/notifications", label: "Notifications" },
];

/** Every studio destination, for anything that needs the full set. */
export const ALL_TABS = [...TABS, ...MORE_TABS];

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
          <StudioTabs tabs={TABS} more={MORE_TABS} />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
