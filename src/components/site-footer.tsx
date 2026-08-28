import Link from "next/link";

import { env } from "@/lib/env";

import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Learn",
    links: [
      { href: "/instructors", label: "Find an instructor" },
      { href: "/classes", label: "Upcoming classes" },
      { href: "/videos", label: "Video library" },
    ],
  },
  {
    title: "Teach",
    links: [
      { href: "/signup?intent=teach", label: "Start teaching" },
      { href: "/studio", label: "Teaching studio" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "My classes" },
      // Google Play requires this route to be reachable by someone who is not
      // signed in, and reachable from outside the app, before it will accept a
      // listing. Linking it here is how it satisfies both.
      { href: "/account/delete", label: "Delete my account" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/terms", label: "Terms of use" },
      { href: "/legal/refunds", label: "Refunds & cancellations" },
      { href: "/contact", label: "Contact us" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-soft">
              One place for instructors to run their classes, and for students to
              find them.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-soft hover:text-brand-700"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          This used to read "A demo application. All instructors, classes and
          reviews shown are fictional." The instructors on the live site are
          real people taking real bookings, so that line was not a stale note —
          it was telling students their teacher was made up.
        */}
        <p className="mt-10 border-t border-line pt-6 text-xs text-ink-faint">
          © {new Date().getFullYear()} {env.appName}. Classes are taught by
          independent instructors, who set their own prices, schedules and
          cancellation terms.
        </p>
      </div>
    </footer>
  );
}
