"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Circle,
  Hand,
  LogOut,
  Mic,
  MicOff,
  MessageSquare,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Send,
  Square,
  UserX,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { cn, initials } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { ParticipantTile } from "./participant-tile";
import { ControlButton } from "./control-button";
import { JitsiRoomView } from "./jitsi-room-view";
import { useLiveRoom, useScreenShareSupport } from "./use-live-room";
import type { LiveParticipant, SimPeer } from "./types";

/**
 * Grid position at `md` and up.
 *
 * Below `md` the tiles are split into a stage tile plus a scrolling strip, which
 * changes their DOM order. These put the desktop grid back the way it has always
 * read — you first, then everyone else — without a second copy of the tree (each
 * participant may only be mounted once, since `attachVideo` keys the video
 * element by identity). Written out in full because Tailwind only sees class
 * names that appear literally in the source.
 */
const MD_ORDER = [
  "md:order-1",
  "md:order-2",
  "md:order-3",
  "md:order-4",
  "md:order-5",
  "md:order-6",
  "md:order-7",
  "md:order-8",
  "md:order-9",
  "md:order-10",
  "md:order-11",
  "md:order-12",
];

/** Past the twelfth tile the exact order stops mattering — they're all offscreen. */
function mdOrder(index: number): string {
  return MD_ORDER[index] ?? "md:order-last";
}

/**
 * Who gets the big tile on a phone, where there is only room for one.
 *
 * Deliberately *not* the active speaker: that flips every few seconds in a
 * conversation and would make the whole layout jump while you're trying to read
 * it. Whoever is presenting wins, then the instructor (the reason a student is
 * here), then anyone but yourself — a self-view is the least useful thing to
 * hand a phone screen to.
 */
function pickStage(
  participants: LiveParticipant[],
  local: LiveParticipant | undefined,
  others: LiveParticipant[],
): LiveParticipant | undefined {
  return (
    participants.find((p) => p.isScreenSharing) ??
    others.find((p) => p.isHost) ??
    others[0] ??
    local
  );
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function LiveRoom({
  sessionId,
  title,
  isHost,
  peers,
  backHref,
}: {
  sessionId: string;
  title: string;
  isHost: boolean;
  peers: SimPeer[];
  backHref: string;
}) {
  const router = useRouter();
  const { state, controller, tokenError, grant, viewerName } = useLiveRoom({ sessionId, peers });
  const canShareScreen = useScreenShareSupport();
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const connectedAt = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.status === "connected" && connectedAt.current === null) {
      connectedAt.current = Date.now();
    }
  }, [state.status]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (connectedAt.current !== null) setElapsedMs(Date.now() - connectedAt.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chat.length]);

  // The panel is a dismissable sheet on a phone, so it needs the dismissal
  // people already expect from one. Radix would give us this for free, but the
  // panel has to stay a single mounted subtree — the chat scroll anchor and the
  // draft message live in it — so it can't be a dialog on one breakpoint and an
  // aside on another.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const local = useMemo(() => state.participants.find((p) => p.isLocal), [state.participants]);
  const others = useMemo(() => state.participants.filter((p) => !p.isLocal), [state.participants]);

  // [local, ...others] is the order the desktop grid has always used; the phone
  // layout reshuffles around a stage tile but restores this at `md` via
  // `mdOrder`.
  const ordered = useMemo(() => (local ? [local, ...others] : others), [local, others]);
  const stage = useMemo(
    () => pickStage(state.participants, local, others),
    [state.participants, local, others],
  );
  const strip = useMemo(
    () => ordered.filter((p) => p.identity !== stage?.identity),
    [ordered, stage],
  );

  if (tokenError) {
    return (
      <RoomMessage
        heading="Couldn't join this class"
        body={tokenError}
        backHref={backHref}
      />
    );
  }

  if (state.status === "error") {
    return (
      <RoomMessage
        heading="Connection problem"
        body={state.error ?? "Something went wrong connecting to the room."}
        backHref={backHref}
      />
    );
  }

  if (state.status === "ended") {
    return (
      <RoomMessage
        heading={isHost ? "Class ended" : "You've left the class"}
        body={
          isHost
            ? "Everyone's been notified, and attendance has been recorded."
            : "Thanks for coming. See you at the next one."
        }
        backHref={backHref}
      />
    );
  }

  if (state.status === "connecting") {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm text-white/70">Setting up your camera and mic…</p>
        </div>
      </div>
    );
  }

  if (grant?.provider === "jitsi" && grant.serverUrl) {
    return (
      <JitsiRoomView
        sessionId={sessionId}
        title={title}
        isHost={isHost}
        backHref={backHref}
        domain={grant.serverUrl}
        roomName={grant.roomName}
        viewerName={viewerName}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-white">
      {/* ---------------------------------------------------------- header */}
      {/* The top inset is the other half of `viewportFit: "cover"` on this
          route: with the page allowed to paint edge to edge, the title would
          otherwise render under the status bar / notch in the TWA shell. Zero
          in an ordinary browser tab. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[calc(0.75rem_+_env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full bg-danger-600/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" />
            Live
          </span>
          <h1 className="truncate text-sm font-medium text-white/90 sm:text-base">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-white/60">
          {state.isRecording ? (
            <span className="flex items-center gap-1 text-danger-400">
              <Circle className="h-2.5 w-2.5 fill-current" /> Recording
            </span>
          ) : null}
          <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
        </div>
      </header>

      {/* ------------------------------------------------------------ body */}
      {/* `relative` only matters below `md`, where the panel is an overlay
          anchored to the video area rather than a column beside it. */}
      {state.audioBlocked ? (
        <div className="flex shrink-0 items-center justify-between gap-3 bg-amber-600/90 px-4 py-2 text-sm text-white">
          <span className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 shrink-0" />
            Audio is muted by your browser — tap to enable.
          </span>
          <button
            type="button"
            onClick={() => controller?.startAudio()}
            className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
          >
            Enable audio
          </button>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* An N-column grid on a 360px screen is N postage stamps, so below
              `md` this is one big tile plus a horizontally scrolling strip.
              `md:contents` dissolves the strip wrapper at desktop widths, which
              is what lets both layouts share one set of mounted tiles. */}
          <div
            className={cn(
              "flex flex-col gap-3 md:grid",
              state.participants.length <= 1
                ? "md:grid-cols-1"
                : state.participants.length === 2
                  // Host gets ~70% of the width so the instructor is clearly
                  // featured and the student tile is a secondary view.
                  ? "md:grid-cols-[2fr_1fr]"
                  : "md:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {stage ? (
              <ParticipantTile
                key={stage.identity}
                participant={stage}
                attachVideo={(el) => controller?.attachVideo(stage.identity, el)}
                className={cn(
                  "w-full md:w-auto",
                  mdOrder(ordered.findIndex((p) => p.identity === stage.identity)),
                )}
              />
            ) : null}

            {strip.length > 0 ? (
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 md:contents">
                {strip.map((p) => (
                  <ParticipantTile
                    key={p.identity}
                    participant={p}
                    attachVideo={(el) => controller?.attachVideo(p.identity, el)}
                    className={cn(
                      "w-36 shrink-0 md:w-auto",
                      mdOrder(ordered.findIndex((o) => o.identity === p.identity)),
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Tap-anywhere-else dismissal for the sheet. Sits inside the body row,
            so it dims the video without ever covering the control bar. */}
        {panel ? (
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
            className="absolute inset-0 z-20 bg-black/40 md:hidden"
          />
        ) : null}

        {panel ? (
          <aside
            className={cn(
              // Phone: a sheet over the video, capped so the class stays watchable
              // behind it. Desktop (`md:`) resets every one of these back to the
              // static side column this has always been.
              "absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl border-t border-white/10 bg-neutral-900 shadow-2xl animate-sheet-up",
              "md:static md:inset-auto md:z-auto md:max-h-none md:w-full md:max-w-xs md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none",
            )}
          >
            <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/25 md:hidden" />
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">
                {panel === "chat" ? "Chat" : `People (${state.participants.length})`}
              </h2>
              {/* 44px of thumb on a phone; `md:h-6 md:w-6` is exactly the box
                  `p-1` around a 16px icon used to make, so the desktop header
                  keeps its height. */}
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white md:mr-0 md:h-6 md:w-6"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {panel === "chat" ? (
              <>
                {/* `overscroll-contain` so flicking to the top of the chat in
                    the sheet doesn't hand the gesture to the page behind it. */}
                <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3">
                  {state.chat.length === 0 ? (
                    <p className="text-xs text-white/40">No messages yet.</p>
                  ) : (
                    state.chat.map((m) =>
                      m.kind === "system" ? (
                        <p key={m.id} className="text-xs italic text-white/40">
                          {m.body}
                        </p>
                      ) : (
                        <div key={m.id} className="text-sm">
                          <span className="font-medium text-white/90">{m.name}</span>
                          <span className="ml-2 text-[10px] text-white/40">
                            {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <p className="text-white/70">{m.body}</p>
                        </div>
                      ),
                    )
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form
                  className="flex shrink-0 items-center gap-2 border-t border-white/10 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatInput.trim()) return;
                    controller?.sendChat(chatInput);
                    setChatInput("");
                  }}
                >
                  {/* `text-base` below `md` is not a style choice: iOS Safari
                      force-zooms the page when you focus an input smaller than
                      16px, and it never zooms back out. */}
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Say something…"
                    className="h-11 flex-1 rounded-lg border border-white/15 bg-neutral-800 px-3 text-base text-white placeholder:text-white/40 focus:border-brand-400 focus:outline-none md:h-9 md:text-sm"
                  />
                  <button
                    type="submit"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 md:h-9 md:w-9"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
                {isHost && others.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => controller?.muteAll()}
                    className="mb-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 md:min-h-0"
                  >
                    <VolumeX className="h-3.5 w-3.5" /> Mute everyone
                  </button>
                ) : null}
                {state.participants.map((p) => (
                  <div
                    key={p.identity}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs font-semibold">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.name}
                      {p.isLocal ? " (you)" : ""}
                    </span>
                    {!p.micOn ? <MicOff className="h-3.5 w-3.5 shrink-0 text-white/40" /> : null}
                    {/* Moderating from a phone means hitting these two with a
                        thumb; `md:h-auto md:w-auto` falls back to the padded
                        26px box the desktop list has always used. */}
                    {isHost && !p.isLocal ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => controller?.muteParticipant(p.identity)}
                          title="Mute"
                          aria-label={`Mute ${p.name}`}
                          className="flex h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white md:h-auto md:w-auto"
                        >
                          <MicOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => controller?.removeParticipant(p.identity)}
                          title="Remove from class"
                          aria-label={`Remove ${p.name} from class`}
                          className="flex h-11 w-11 items-center justify-center rounded-md p-1.5 text-white/60 hover:bg-danger-600/30 hover:text-danger-300 md:h-auto md:w-auto"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {/* --------------------------------------------------------- controls */}
      {/* The bottom padding clears the gesture bar on a phone: without the
          `env()` term the last row of controls sits underneath the home
          indicator, where the swipe wins and the tap never lands. It resolves
          to 0 everywhere else, so this is `py-3.5` on a desktop. */}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 border-t border-white/10 px-4 py-3.5 pb-[calc(0.875rem_+_env(safe-area-inset-bottom))]">
        <ControlButton
          label={local?.micOn ? "Mute" : "Unmute"}
          active={!!local?.micOn}
          onClick={() => controller?.toggleMic()}
        >
          {local?.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>
        <ControlButton
          label={local?.camOn ? "Turn camera off" : "Turn camera on"}
          active={!!local?.camOn}
          onClick={() => controller?.toggleCamera()}
        >
          {local?.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </ControlButton>
        {/* Absent on every mobile browser, where this could only ever throw —
            and the width it frees up is what lets the rest fit one row. */}
        {canShareScreen ? (
          <ControlButton
            label={local?.isScreenSharing ? "Stop presenting" : "Share screen"}
            active={!local?.isScreenSharing}
            onClick={() => controller?.toggleScreenShare()}
          >
            {local?.isScreenSharing ? (
              <ScreenShareOff className="h-5 w-5" />
            ) : (
              <ScreenShare className="h-5 w-5" />
            )}
          </ControlButton>
        ) : null}
        <ControlButton
          label={local?.handRaised ? "Lower hand" : "Raise hand"}
          active={!local?.handRaised}
          onClick={() => controller?.toggleHandRaise()}
        >
          <Hand className="h-5 w-5" />
        </ControlButton>
        <ControlButton
          label="Chat"
          active={panel !== "chat"}
          onClick={() => setPanel((p) => (p === "chat" ? null : "chat"))}
        >
          <MessageSquare className="h-5 w-5" />
        </ControlButton>
        <ControlButton
          label="People"
          active={panel !== "people"}
          onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
        >
          <Users className="h-5 w-5" />
        </ControlButton>

        {isHost ? (
          <ControlButton
            label={state.isRecording ? "Stop recording" : "Start recording"}
            active={!state.isRecording}
            onClick={() =>
              state.isRecording ? controller?.stopRecording() : controller?.startRecording()
            }
          >
            {state.isRecording ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </ControlButton>
        ) : null}

        {/* 13px of separator is 13px the buttons don't get on a 360px screen,
            and the red Leave/End button already reads as set apart. */}
        <div className="mx-1 hidden h-8 w-px bg-white/15 md:block" />

        {isHost ? (
          confirmEnd ? (
            // `w-full` claims its own row in the wrapping bar on a phone, so the
            // three hit targets aren't crushed in beside the other controls.
            <div className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-800 px-3 py-1.5 md:w-auto">
              <span className="text-xs text-white/80">End for everyone?</span>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex min-h-11 items-center rounded-full px-3 py-1 text-xs text-white/60 hover:bg-white/10 md:min-h-0 md:px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  controller?.endClass();
                  router.push(backHref);
                }}
                className="flex min-h-11 items-center rounded-full bg-danger-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-danger-700 md:min-h-0 md:px-2.5"
              >
                End class
              </button>
            </div>
          ) : (
            <ControlButton label="End class" danger onClick={() => setConfirmEnd(true)}>
              <PhoneOff className="h-5 w-5" />
            </ControlButton>
          )
        ) : (
          <ControlButton
            label="Leave"
            danger
            onClick={() => {
              controller?.leave();
              router.push(backHref);
            }}
          >
            <LogOut className="h-5 w-5" />
          </ControlButton>
        )}
      </footer>
    </div>
  );
}

function RoomMessage({
  heading,
  body,
  backHref,
}: {
  heading: string;
  body: string;
  backHref: string;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-neutral-950 px-4 py-8 text-center text-white">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="mt-2 text-sm text-white/60">{body}</p>
        <ButtonLink href={backHref} className="mt-6 min-h-11" variant="secondary">
          Back
        </ButtonLink>
      </div>
    </div>
  );
}
