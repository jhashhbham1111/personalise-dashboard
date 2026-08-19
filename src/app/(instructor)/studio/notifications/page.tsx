import type { Metadata } from "next";

import { requireInstructor } from "@/lib/auth";
import { markNotificationsRead, recentNotifications } from "@/lib/notify";
import { NotificationList } from "@/components/notification-list";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Notifications" };

export default async function StudioNotificationsPage() {
  const user = await requireInstructor();

  const items = await recentNotifications(user.id, 40);
  // Opening the page is the read receipt. Done after fetching so the unread
  // styling still renders once on this visit.
  await markNotificationsRead(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="New enrolments, class reminders and payouts that need your attention."
      />
      <NotificationList items={items} />
    </div>
  );
}
