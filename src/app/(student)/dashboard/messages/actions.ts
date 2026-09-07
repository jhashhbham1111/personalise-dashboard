"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { loadMessagesSince, sendMessage } from "@/lib/chat";
import { fail, ok, str, type ActionState } from "@/lib/actions";

export async function sendStudentChatMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard/messages");

  const result = await sendMessage({
    conversationId: str(form, "conversationId"),
    senderId: user.id,
    body: str(form, "body"),
  });
  if (!result.ok) return fail(result.error);

  // Not the thread itself — the client already has the message via its own
  // poll, and revalidating a route the visitor is actively polling would just
  // race its own fetch. This is for the inbox list's preview text next time
  // it's opened.
  revalidatePath("/dashboard/messages");
  return ok("Sent");
}

/**
 * Not tied to a `<form>` — called directly from the thread's polling timer,
 * which is how a Server Action can be used as a plain RPC.
 */
export async function pollStudentChatMessagesAction(conversationId: string, afterIso: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Signed out." };
  return loadMessagesSince({
    conversationId,
    viewerId: user.id,
    after: new Date(afterIso),
  });
}
