"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({
  unreadCount,
  href = "/dashboard/notifications",
}: {
  unreadCount: number;
  /** Where the bell opens — student and instructor accounts each have their own list. */
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="relative grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
    >
      <Bell className="h-[18px] w-[18px]" />
      {unreadCount > 0 ? (
        <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
