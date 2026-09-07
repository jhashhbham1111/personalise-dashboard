import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { requireInstructor } from "@/lib/auth";
import { listConversationsForInstructor } from "@/lib/chat";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Messages" };

export default async function InstructorMessagesPage() {
  const user = await requireInstructor();
  const rows = await listConversationsForInstructor(user.instructorProfileId);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="A private line to each student you've taught."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-8 w-8" />}
          title="Nobody to message yet"
          description="Once someone enrols with you, you'll be able to message them here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.studentId} href={`/studio/messages/${r.studentId}`} className="block">
              <Card
                className={cn(
                  "flex items-center gap-3 p-4 transition-colors hover:border-brand-200",
                  r.unread && "border-brand-300 bg-brand-50/50",
                )}
              >
                <Avatar name={r.studentName} src={r.studentAvatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm text-ink",
                        r.unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {r.studentName}
                    </p>
                    {r.lastMessageAt ? (
                      <span className="shrink-0 text-xs text-ink-faint">
                        {formatRelative(r.lastMessageAt, now)}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-ink-soft">
                    {r.lastMessagePreview ?? "No messages yet — say hello."}
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
