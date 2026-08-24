"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type Tab = { href: string; label: string };

/**
 * Studio navigation. Client-side only so the active tab can be derived from the
 * current path — the layout above it stays a server component.
 *
 * Split into a primary row and a "More" menu: everything an instructor touches
 * weekly is one click away, and the set-up-once sections stay reachable
 * without competing for the same space.
 */
export function StudioTabs({ tabs, more = [] }: { tabs: Tab[]; more?: Tab[] }) {
  const pathname = usePathname();

  // "/studio" must not light up for every child route.
  const isActive = (href: string) =>
    href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);

  const activeMore = more.find((t) => isActive(t.href));

  return (
    <nav className="flex items-stretch gap-1 overflow-x-auto" aria-label="Studio sections">
      {tabs.map((t) => (
        <TabLink key={t.href} tab={t} active={isActive(t.href)} />
      ))}

      {more.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className={cn(
              "flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              // Highlighted while you're on one of its pages, so the row still
              // tells you where you are.
              activeMore
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-ink-soft hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {activeMore ? activeMore.label : "More"}
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-lg"
            >
              {more.map((t) => (
                <DropdownMenu.Item key={t.href} asChild>
                  <Link
                    href={t.href}
                    aria-current={isActive(t.href) ? "page" : undefined}
                    className={cn(
                      "block cursor-pointer rounded-md px-3 py-2 text-sm outline-none transition-colors",
                      isActive(t.href)
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
                    )}
                  >
                    {t.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
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
