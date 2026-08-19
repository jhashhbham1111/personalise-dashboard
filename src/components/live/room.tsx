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
  VolumeX,
  X,
} from "lucide-react";

import { cn, initials } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { ParticipantTile } from "./participant-tile";
import { ControlButton } from "./control-button";
import { useLiveRoom } from "./use-live-room";
import type { SimPeer } from "./types";

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
  const { state, controller, tokenError } = useLiveRoom({ sessionId, peers });
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

  const local = useMemo(() => state.participants.find((p) => p.isLocal), [state.participants]);
  const others = useMemo(() => state.participants.filter((p) => !p.isLocal), [state.participants]);

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

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-white">
      {/* ---------------------------------------------------------- header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
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
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div
            className={cn(
              "grid gap-3",
              state.participants.length <= 1
                ? "grid-cols-1"
                : state.participants.length === 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-2 lg:grid-cols-3",
            )}
          >
            {local ? (
              <ParticipantTile
                key={local.identity}
                participant={local}
                attachVideo={(el) => controller?.attachVideo(local.identity, el)}
              />
            ) : null}
            {others.map((p) => (
              <ParticipantTile
                key={p.identity}
                participant={p}
                attachVideo={(el) => controller?.attachVideo(p.identity, el)}
              />
            ))}
          </div>
        </div>

        {panel ? (
          <aside className="flex w-full max-w-xs shrink-0 flex-col border-l border-white/10 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="text-sm font-semibold">
                {panel === "chat" ? "Chat" : `People (${state.participants.length})`}
              </h2>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {panel === "chat" ? (
              <>
                <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
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
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Say something…"
                    className="h-9 flex-1 rounded-lg border border-white/15 bg-neutral-800 px-3 text-sm text-white placeholder:text-white/40 focus:border-brand-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 space-y-1 overflow-y-auto p-3">
                {isHost && others.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => controller?.muteAll()}
                    className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
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
                    {isHost && !p.isLocal ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => controller?.muteParticipant(p.identity)}
                          title="Mute"
                          className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          <MicOff className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => controller?.removeParticipant(p.identity)}
                          title="Remove from class"
                          className="rounded-md p-1.5 text-white/60 hover:bg-danger-600/30 hover:text-danger-300"
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
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 border-t border-white/10 px-4 py-3.5">
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

        <div className="mx-1 h-8 w-px bg-white/15" />

        {isHost ? (
          confirmEnd ? (
            <div className="flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1.5">
              <span className="text-xs text-white/80">End for everyone?</span>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="rounded-full px-2 py-1 text-xs text-white/60 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  controller?.endClass();
                  router.push(backHref);
                }}
                className="rounded-full bg-danger-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-danger-700"
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
    <div className="flex h-dvh items-center justify-center bg-neutral-950 px-4 text-center text-white">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="mt-2 text-sm text-white/60">{body}</p>
        <ButtonLink href={backHref} className="mt-6" variant="secondary">
          Back
        </ButtonLink>
      </div>
    </div>
  );
}
