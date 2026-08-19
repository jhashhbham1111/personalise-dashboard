import Link from "next/link";

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
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
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

        <p className="mt-10 border-t border-line pt-6 text-xs text-ink-faint">
          A demo application. All instructors, classes and reviews shown are
          fictional.
        </p>
      </div>
    </footer>
  );
}
