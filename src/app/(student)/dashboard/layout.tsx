import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { Role } from "@/lib/enums";
import { SiteHeader } from "@/components/site-header";

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/passes", label: "My passes" },
  { href: "/dashboard/payments", label: "Fees" },
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
      {/*
       * "Redeem a code" lives in the header rather than here.
       *
       * Sitting at the end of the tab row it read as a stray tab that had been
       * coloured in — next to the bell it sits with the other things you *do*
       * rather than the places you go, and it stays put as you move between
       * tabs instead of appearing to belong to whichever one is open.
       */}
      <SiteHeader
        homeHref={isStudent ? "/dashboard" : "/studio"}
        showPublicNav={false}
        showRedeem={isStudent}
      />

      {isStudent ? (
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
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
