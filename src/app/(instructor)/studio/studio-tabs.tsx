"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Tab = { href: string; label: string };

/**
 * Studio navigation. Client-side only so the active tab can be derived from the
 * current path — the layout above it stays a server component.
 */
export function StudioTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  // "/studio" must not light up for every child route.
  const isActive = (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);

  return (
    <nav className="flex items-stretch gap-1 overflow-x-auto" aria-label="Studio sections">
      {tabs.map((t) => (
        <TabLink key={t.href} tab={t} active={isActive(t.href)} />
      ))}
    </nav>
  );
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-ink-soft hover:border-brand-300 hover:text-brand-700",
      )}
    >
      {tab.label}
    </Link>
  );
}
