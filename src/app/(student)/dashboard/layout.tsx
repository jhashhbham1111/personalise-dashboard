import Link from "next/link";
import { Ticket } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Role } from "@/lib/enums";
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
  const user = await requireUser("/dashboard");

  /**
   * Settings lives under /dashboard, and it's the one link here an instructor
   * is given — so opening it used to hand a teacher a student's navigation:
   * My passes, Payments, and a "Redeem a code" button. Instructors *generate*
   * pass codes (Studio → Pass codes); redeeming one is the student side of
   * that exchange. The pages still work if they're reached directly; they
   * just stop being advertised to someone they don't belong to.
   */
  const isStudent = user.role === Role.STUDENT;

  return (
    <div className="min-h-screen">
      <SiteHeader homeHref={isStudent ? "/dashboard" : "/studio"} showPublicNav={false} />

      {isStudent ? (
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6">
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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

          {/*
           * Pulled out of the tab row and given a button.
           *
           * As the fourth of six identical grey tabs it was invisible to the
           * one person who needs it — someone holding a code an instructor
           * just handed them, who has no reason to read a nav bar looking for
           * the word "redeem". It's the primary action for a student without
           * a pass, so it looks like one.
           */}
          <Link
            href="/dashboard/redeem"
            className="my-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Ticket className="h-4 w-4" />
            <span className="hidden sm:inline">Redeem a code</span>
            <span className="sm:hidden">Redeem</span>
          </Link>
        </div>
      </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
