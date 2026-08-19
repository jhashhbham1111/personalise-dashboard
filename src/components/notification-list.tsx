import Link from "next/link";
import { Bell } from "lucide-react";

import { formatRelative } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Shared card-list rendering for both the student and instructor
 * notification pages — same list, same read/unread styling, just fed a
 * different (role-scoped) `recentNotifications(userId)` query by each page.
 */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-8 w-8" />}
        title="Nothing here yet"
        description="We'll let you know when something needs your attention."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => {
        const body = (
          <Card className={n.readAt ? "p-4" : "border-brand-200 bg-brand-50/60 p-4"}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-ink">{n.title}</p>
              <span className="shrink-0 text-xs text-ink-faint">
                {formatRelative(n.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{n.body}</p>
          </Card>
        );

        return n.link ? (
          <Link key={n.id} href={n.link} className="block">
            {body}
          </Link>
        ) : (
          <div key={n.id}>{body}</div>
        );
      })}
    </div>
  );
}
