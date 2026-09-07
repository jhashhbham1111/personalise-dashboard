import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { requireInstructor } from "@/lib/auth";
import { loadThread, openConversation } from "@/lib/chat";
import { Alert } from "@/components/ui/page";
import { ChatThread } from "@/components/chat-thread";
import { pollInstructorChatMessagesAction, sendInstructorChatMessageAction } from "../actions";

export const metadata: Metadata = { title: "Messages" };

const BACK_LINK = (
  <Link
    href="/studio/messages"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-brand-700"
  >
    <ArrowLeft className="h-4 w-4" />
    Messages
  </Link>
);

export default async function InstructorThreadPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const user = await requireInstructor();

  const opened = await openConversation({
    studentId,
    instructorId: user.instructorProfileId,
  });
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
      <h1 className="text-xl font-semibold text-ink">{thread.studentName}</h1>

      <ChatThread
        conversationId={thread.conversationId}
        viewerId={user.id}
        otherPartyName={thread.studentName}
        timezone={user.timezone}
        initialMessages={thread.messages}
        sendAction={sendInstructorChatMessageAction}
        pollAction={pollInstructorChatMessagesAction}
      />
    </div>
  );
}
