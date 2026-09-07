import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { listConversationsForStudent } from "@/lib/chat";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Messages" };

export default async function StudentMessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const rows = await listConversationsForStudent(user.id);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="A private line to each instructor you've trained with."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-8 w-8" />}
          title="Nobody to message yet"
          description="Enrol with an instructor and you'll be able to message them here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.instructorId} href={`/dashboard/messages/${r.instructorId}`} className="block">
              <Card
                className={cn(
                  "flex items-center gap-3 p-4 transition-colors hover:border-brand-200",
                  r.unread && "border-brand-300 bg-brand-50/50",
                )}
              >
                <Avatar name={r.instructorName} src={r.instructorAvatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm text-ink",
                        r.unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {r.instructorName}
                    </p>
                    {r.lastMessageAt ? (
                      <span className="shrink-0 text-xs text-ink-faint">
                        {formatRelative(r.lastMessageAt, now)}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-ink-soft">
                    {r.lastMessagePreview ?? "Say hello — start the conversation."}
                  </p>
                </div>
                {r.unread ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600"
                    aria-label="Unread"
                  />
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
