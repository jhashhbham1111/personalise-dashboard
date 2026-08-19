"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Admin sections">
      {tabs.map((t) => {
        const active =
          t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
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
