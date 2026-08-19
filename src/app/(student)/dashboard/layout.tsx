import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/passes", label: "My passes" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/notifications", label: "Notifications" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser("/dashboard");

  return (
    <div className="min-h-screen">
      <SiteHeader homeHref="/dashboard" showPublicNav={false} />

      <div className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
