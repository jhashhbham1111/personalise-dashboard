import Link from "next/link";

import { requireInstructor } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { StudioTabs } from "./studio-tabs";

export const TABS = [
  { href: "/studio", label: "Overview" },
  { href: "/studio/notifications", label: "Notifications" },
  { href: "/studio/offerings", label: "Classes" },
  { href: "/studio/schedule", label: "Schedule" },
  { href: "/studio/students", label: "Students" },
  { href: "/studio/payments", label: "Fees" },
  { href: "/studio/codes", label: "Pass codes" },
  { href: "/studio/media", label: "Videos" },
  { href: "/studio/updates", label: "Updates" },
  { href: "/studio/venues", label: "Venues" },
  { href: "/studio/profile", label: "Public page" },
];

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireInstructor();

  return (
    <div className="min-h-screen">
      <SiteHeader homeHref="/studio" showPublicNav={false} />

      <div className="border-b border-line bg-surface">
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
