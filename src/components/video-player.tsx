"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Compass, Heart, UserCheck, UserPlus, X } from "lucide-react";

import {
  toggleInstructorFollowAction,
  toggleVideoLikeAction,
} from "@/app/(marketing)/actions";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Class recording / vlog player.
 *
 * Surfaces a like/follow/explore prompt at the top of the frame once a minute
 * of actual playback has accumulated (tracked off the video's own
 * currentTime, not a wall-clock timer — a paused video shouldn't nag), or as
 * soon as the video ends, whichever comes first — most snippets run well
 * under a minute, so `ended` is the one that actually fires for them.
 */
export function VideoPlayer({
  src,
  poster,
  videoId,
  instructorId,
  instructorName,
  instructorDiscipline,
  viewerSignedIn,
  initialLiked,
  initialLikeCount,
  initialFollowing,
}: {
  src: string;
  poster?: string | null;
  videoId: string;
  instructorId: string;
  instructorName: string;
  instructorDiscipline: string | null;
  viewerSignedIn: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
  initialFollowing: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const promptFired = useRef(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-ink">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v || promptFired.current || v.currentTime < 60) return;
          promptFired.current = true;
          setShowPrompt(true);
        }}
        onEnded={() => {
          // Most seeded clips run well under a minute, so the 60s mark above
          // never fires for them — the prompt still needs to land once the
          // viewer has watched the whole thing.
          if (promptFired.current) return;
          promptFired.current = true;
          setShowPrompt(true);
        }}
      />

      {showPrompt && !dismissed ? (
        <EngagementPrompt
          videoId={videoId}
          instructorId={instructorId}
          instructorName={instructorName}
          instructorDiscipline={instructorDiscipline}
          viewerSignedIn={viewerSignedIn}
          initialLiked={initialLiked}
          initialLikeCount={initialLikeCount}
          initialFollowing={initialFollowing}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}
    </div>
  );
}

function EngagementPrompt({
  videoId,
  instructorId,
  instructorName,
  instructorDiscipline,
  viewerSignedIn,
  initialLiked,
  initialLikeCount,
  initialFollowing,
  onDismiss,
}: {
  videoId: string;
  instructorId: string;
  instructorName: string;
  instructorDiscipline: string | null;
  viewerSignedIn: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
  initialFollowing: boolean;
  onDismiss: () => void;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  const signInHref = `/login?next=/videos/${videoId}`;
  const exploreHref = instructorDiscipline
    ? `/instructors?discipline=${encodeURIComponent(instructorDiscipline)}`
    : "/instructors";

  return (
    <div className="absolute inset-x-0 top-0 flex flex-col gap-3 bg-gradient-to-b from-ink/95 to-ink/70 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white sm:static sm:order-3"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="pr-6 text-sm font-medium sm:pr-0">
        Enjoying this? Like it and follow {instructorName.split(" ")[0]} for more.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {viewerSignedIn ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await toggleVideoLikeAction(videoId);
                setLiked(result.liked);
                setLikeCount(result.count);
              })
            }
          >
            <Heart className={cn("h-4 w-4", liked && "fill-danger-500 text-danger-500")} />
            {likeCount > 0 ? likeCount : "Like"}
          </Button>
        ) : (
          <ButtonLink href={signInHref} variant="secondary" size="sm">
            <Heart className="h-4 w-4" />
            Like
          </ButtonLink>
        )}

        {viewerSignedIn ? (
          <Button
            variant={following ? "secondary" : "accent"}
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await toggleInstructorFollowAction(instructorId);
                setFollowing(result.following);
              })
            }
          >
            {following ? (
              <UserCheck className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {following ? "Following" : "Follow"}
          </Button>
        ) : (
          <ButtonLink href={signInHref} variant="accent" size="sm">
            <UserPlus className="h-4 w-4" />
            Follow
          </ButtonLink>
        )}

        <Link
          href={exploreHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/90 underline-offset-4 hover:underline"
        >
          <Compass className="h-4 w-4" />
          Explore more
        </Link>
      </div>
    </div>
  );
}
