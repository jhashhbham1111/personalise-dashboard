"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Presentation,
  Settings,
  Shield,
} from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import type { CurrentUser } from "@/lib/auth";
import { Avatar } from "./ui/avatar";
import { NotificationBell } from "./notification-bell";

export function UserMenu({
  user,
  unreadCount,
}: {
  user: CurrentUser;
  unreadCount: number;
}) {
  // Each account has exactly one role, and "my classes" means something
  // different for each: a student's booked sessions, an instructor's own
  // teaching studio. Previously every role saw the same two student-shaped
  // links ("My classes" -> /dashboard, "Bookings" -> /dashboard/bookings) in
  // addition to their own — so an instructor's "My classes" opened the
  // student booking dashboard (always empty for them) instead of Studio.
  const isInstructorAccount =
    user.role === "INSTRUCTOR" || (user.role === "ADMIN" && !!user.instructorProfileId);
  const isStudent = user.role === "STUDENT";

  // Same reasoning as "My classes" above: an instructor's notifications (new
  // enrolments, class reminders) belong in the studio, not the student
  // dashboard's notification list.
  const notificationsHref = isInstructorAccount
    ? "/studio/notifications"
    : "/dashboard/notifications";

  const items = [
    { href: "/dashboard", label: "My classes", icon: LayoutDashboard, show: isStudent },
    { href: "/dashboard/bookings", label: "Bookings", icon: CalendarDays, show: isStudent },
    { href: "/studio", label: "My classes", icon: Presentation, show: isInstructorAccount },
    { href: "/admin", label: "Admin", icon: Shield, show: user.role === "ADMIN" },
    { href: "/dashboard/settings", label: "Settings", icon: Settings, show: true },
  ].filter((i) => i.show);

  return (
    <div className="flex items-center gap-1">
      <NotificationBell unreadCount={unreadCount} href={notificationsHref} />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-brand-50"
            aria-label="Account menu"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg animate-fade-up"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-faint">{user.email}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />

            {items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenu.Item key={item.href} asChild>
                  <Link
                    href={item.href}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </DropdownMenu.Item>
              );
            })}

            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item asChild>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft outline-none hover:bg-danger-100 hover:text-danger-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
