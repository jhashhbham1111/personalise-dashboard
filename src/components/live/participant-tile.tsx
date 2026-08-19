"use client";

import { Crown, MicOff, Hand } from "lucide-react";

import { cn, initials } from "@/lib/utils";
import type { LiveParticipant } from "./types";

export function ParticipantTile({
  participant,
  attachVideo,
}: {
  participant: LiveParticipant;
  attachVideo: (el: HTMLVideoElement | null) => void;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-neutral-900",
        participant.speaking && "ring-2 ring-brand-400",
      )}
    >
      {participant.hasVideo ? (
        <video
          ref={attachVideo}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={cn(
            "h-full w-full object-cover",
            participant.isLocal && !participant.isScreenSharing && "-scale-x-100",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-800">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-700 text-lg font-semibold text-white">
            {initials(participant.name)}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2.5">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-white">
          {participant.isHost ? <Crown className="h-3.5 w-3.5 shrink-0 text-accent-400" /> : null}
          <span className="truncate">
            {participant.name}
            {participant.isLocal ? " (you)" : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {participant.handRaised ? (
            <Hand className="h-3.5 w-3.5 text-accent-400" />
          ) : null}
          {!participant.micOn ? (
            <span className="rounded-full bg-black/50 p-1">
              <MicOff className="h-3 w-3 text-white" />
            </span>
          ) : null}
        </span>
      </div>

      {participant.isScreenSharing ? (
        <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Presenting
        </span>
      ) : null}
    </div>
  );
}
