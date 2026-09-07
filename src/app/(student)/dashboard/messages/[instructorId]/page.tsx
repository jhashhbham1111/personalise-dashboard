import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { loadThread, openConversation } from "@/lib/chat";
import { Alert } from "@/components/ui/page";
import { ChatThread } from "@/components/chat-thread";
import { pollStudentChatMessagesAction, sendStudentChatMessageAction } from "../actions";

export const metadata: Metadata = { title: "Messages" };

const BACK_LINK = (
  <Link
    href="/dashboard/messages"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-700"
  >
    <ArrowLeft className="h-4 w-4" />
    Messages
  </Link>
);

export default async function StudentThreadPage({
  params,
}: {
  params: Promise<{ instructorId: string }>;
}) {
  const { instructorId } = await params;
  const user = await requireUser("/dashboard/messages");

  const opened = await openConversation({ studentId: user.id, instructorId });
  if (!opened.ok) {
    return (
      <div className="space-y-4">
        {BACK_LINK}
        <Alert tone="danger">{opened.error}</Alert>
      </div>
    );
  }

  const thread = await loadThread({
    conversationId: opened.conversationId,
    viewerId: user.id,
  });
  if (!thread.ok) {
    return (
      <div className="space-y-4">
        {BACK_LINK}
        <Alert tone="danger">{thread.error}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {BACK_LINK}
      <h1 className="text-xl font-semibold text-ink">{thread.instructorName}</h1>

      <ChatThread
        conversationId={thread.conversationId}
        viewerId={user.id}
        otherPartyName={thread.instructorName}
        timezone={user.timezone}
        initialMessages={thread.messages}
        sendAction={sendStudentChatMessageAction}
        pollAction={pollStudentChatMessagesAction}
      />
    </div>
  );
}
