"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, requireInstructor } from "@/lib/auth";
import { loadMessagesSince, sendMessage } from "@/lib/chat";
import { fail, ok, str, type ActionState } from "@/lib/actions";

export async function sendInstructorChatMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();

  const result = await sendMessage({
    conversationId: str(form, "conversationId"),
    senderId: user.id,
    body: str(form, "body"),
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/studio/messages");
  return ok("Sent");
}

/**
 * Not tied to a `<form>` — called directly from the thread's polling timer,
 * which is how a Server Action can be used as a plain RPC.
 */
export async function pollInstructorChatMessagesAction(conversationId: string, afterIso: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Signed out." };
  return loadMessagesSince({
    conversationId,
    viewerId: user.id,
    after: new Date(afterIso),
  });
}
