"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { emptyState, type ActionState } from "@/lib/actions";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Textarea } from "./ui/input";
import { SubmitButton } from "./ui/submit-button";

export type ChatThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
};

type PollResult =
  | { ok: true; messages: ChatThreadMessage[] }
  | { ok: false; error: string };

/**
 * One conversation, shared between the student and instructor sides.
 *
 * There is no websocket or push channel anywhere in this app — every other
 * page is server-rendered and only ever updates on the next navigation or
 * form submit. A thread that behaved the same way would mean reloading the
 * page to see a reply, so this is the one place that polls: every four
 * seconds, and only while the tab is actually visible, it asks the server for
 * anything newer than the last message it already has. That is a deliberate,
 * narrow exception to how the rest of the app works, not a pattern to copy
 * onto pages that don't need it.
 */
export function ChatThread({
  conversationId,
  viewerId,
  otherPartyName,
  timezone,
  initialMessages,
  sendAction,
  pollAction,
}: {
  conversationId: string;
  viewerId: string;
  otherPartyName: string;
  timezone: string;
  initialMessages: ChatThreadMessage[];
  sendAction: (prevState: ActionState, form: FormData) => Promise<ActionState>;
  pollAction: (conversationId: string, afterIso: string) => Promise<PollResult>;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, action] = useActionState(sendAction, emptyState);
  const formRef = useRef<HTMLFormElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Tags which ActionState object has already been reacted to, so a re-render
  // with the same state (nothing new submitted) doesn't reset the form again —
  // the same trick useCloseOnSuccess uses for a modal.
  const handledState = useRef<ActionState | null>(null);
  const lastTimestamp = useRef<Date>(
    initialMessages.length > 0
      ? initialMessages[initialMessages.length - 1]!.createdAt
      : new Date(0),
  );

  async function refresh() {
    const result = await pollAction(
      conversationId,
      new Date(lastTimestamp.current).toISOString(),
    );
    if (!result.ok || result.messages.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = result.messages.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return prev;
      lastTimestamp.current = fresh[fresh.length - 1]!.createdAt;
      return [...prev, ...fresh];
    });
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 4000);
    return () => clearInterval(timer);
    // refresh() closes over conversationId/pollAction, which don't change
    // for a mounted thread — re-subscribing every render would just restart
    // the same interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (state.success && handledState.current !== state) {
      handledState.current = state;
      formRef.current?.reset();
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  return (
    <div className="flex h-[65vh] flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">
            Say hello to {otherPartyName} — this is just between the two of you.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    mine
                      ? "bg-brand-600 text-white"
                      : "border border-line bg-paper text-ink",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", mine ? "text-brand-100" : "text-ink-faint")}>
                    {formatTime(new Date(m.createdAt), timezone)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {state.error ? (
        <p className="border-t border-line bg-danger-100 px-4 py-2 text-xs text-danger-700">
          {state.error}
        </p>
      ) : null}

      <form ref={formRef} action={action} className="flex items-end gap-2 border-t border-line p-3">
        <input type="hidden" name="conversationId" value={conversationId} />
        <Textarea
          name="body"
          rows={1}
          required
          maxLength={4000}
          placeholder={`Message ${otherPartyName}…`}
          className="max-h-32 min-h-10 flex-1 resize-none py-2.5"
          onKeyDown={(e) => {
            // Shift+Enter still makes a new line; plain Enter sends, matching
            // every chat app this could be compared to. Clicking the send
            // button rather than calling form.requestSubmit(): the latter
            // doesn't reliably reach a <form action={...}> bound to a
            // useActionState action, since nothing simulates the click that
            // normally supplies the submitter React's action handling expects.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendButtonRef.current?.click();
            }
          }}
        />
        {/* A plain native submit button the Enter-key shortcut clicks
            directly — see the onKeyDown comment above for why. */}
        <button ref={sendButtonRef} type="submit" tabIndex={-1} className="sr-only">
          Send
        </button>
        <SubmitButton size="icon" aria-label={`Send to ${otherPartyName}`}>
          <Send className="h-4 w-4" />
        </SubmitButton>
      </form>
    </div>
  );
}
