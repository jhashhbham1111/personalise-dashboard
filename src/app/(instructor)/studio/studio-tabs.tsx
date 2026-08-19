"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Studio navigation. Client-side only so the active tab can be derived from the
 * current path — the layout above it stays a server component.
 */
export function StudioTabs({
  tabs,
}: {
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Studio sections">
      {tabs.map((t) => {
        // "/studio" must not light up for every child route.
        const active =
          t.href === "/studio" ? pathname === "/studio" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              active
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-ink-soft hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
