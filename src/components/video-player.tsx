"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Calendar, Compass, Heart, UserCheck, UserPlus, X } from "lucide-react";

import {
  toggleInstructorFollowAction,
  toggleVideoLikeAction,
} from "@/app/(marketing)/actions";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";

/** How long a video has to actually play before the engagement prompt shows. */
const ENGAGEMENT_PROMPT_SECONDS = 90;

/**
 * Class recording / vlog player.
 *
 * Surfaces a prompt at the top of the frame once ENGAGEMENT_PROMPT_SECONDS of
 * actual playback has accumulated (tracked off the video's own currentTime,
 * not a wall-clock timer — a paused video shouldn't nag), or as soon as the
 * video ends, whichever comes first — most snippets run well under that
 * threshold, so `ended` is the one that actually fires for them. The two
 * triggers show different prompts: mid-video gets a soft like/follow nudge,
 * `ended` leads with booking a class — the viewer just finished watching and
 * is as convinced as they're going to get.
 */
export function VideoPlayer({
  src,
  poster,
  videoId,
  instructorId,
  instructorSlug,
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
  instructorSlug: string;
  instructorName: string;
  instructorDiscipline: string | null;
  viewerSignedIn: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
  initialFollowing: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const promptFired = useRef(false);
  // Which event surfaced the prompt: "ended" gets the harder push toward
  // booking a class (highest-intent moment — they just watched the whole
  // thing), "time" keeps the lighter like/follow nudge for someone still
  // mid-video.
  const [trigger, setTrigger] = useState<"time" | "ended" | null>(null);
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
          if (!v || promptFired.current || v.currentTime < ENGAGEMENT_PROMPT_SECONDS)
            return;
          promptFired.current = true;
          setTrigger("time");
        }}
        onEnded={() => {
          // Most seeded clips run well under ENGAGEMENT_PROMPT_SECONDS, so the
          // check above never fires for them — the prompt still needs to land
          // once the viewer has watched the whole thing. Ended always wins
          // over an earlier "time" trigger, since it's the stronger moment.
          promptFired.current = true;
          setTrigger("ended");
        }}
      />

      {trigger && !dismissed ? (
        <EngagementPrompt
          videoId={videoId}
          instructorId={instructorId}
          instructorSlug={instructorSlug}
          instructorName={instructorName}
          instructorDiscipline={instructorDiscipline}
          viewerSignedIn={viewerSignedIn}
          initialLiked={initialLiked}
          initialLikeCount={initialLikeCount}
          initialFollowing={initialFollowing}
          ended={trigger === "ended"}
          onDismiss={() => setDismissed(true)}
        />
      ) : null}
    </div>
  );
}

function EngagementPrompt({
  videoId,
  instructorId,
  instructorSlug,
  instructorName,
  instructorDiscipline,
  viewerSignedIn,
  initialLiked,
  initialLikeCount,
  initialFollowing,
  ended,
  onDismiss,
}: {
  videoId: string;
  instructorId: string;
  instructorSlug: string;
  instructorName: string;
  instructorDiscipline: string | null;
  viewerSignedIn: boolean;
  initialLiked: boolean;
  initialLikeCount: number;
  initialFollowing: boolean;
  ended: boolean;
  onDismiss: () => void;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [following, setFollowing] = useState(initialFollowing);
  const [isPending, startTransition] = useTransition();

  const firstName = instructorName.split(" ")[0];
  const signInHref = `/login?next=/videos/${videoId}`;
  const classesHref = `/i/${instructorSlug}#classes`;
  const exploreHref = instructorDiscipline
    ? `/instructors?discipline=${encodeURIComponent(instructorDiscipline)}`
    : "/instructors";

  return (
    <div className="absolute inset-x-0 top-0 flex flex-col gap-3 bg-gradient-to-b from-ink/95 to-ink/70 p-4 text-white">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="pr-6 text-sm font-medium">
        {ended
          ? `That's the video — ${firstName} teaches this live. Want in?`
          : `Enjoying this? Like it and follow ${firstName} for more.`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {/* The moment the video actually ends is the highest-intent point —
            lead with booking a class rather than burying it after like/follow. */}
        {ended ? (
          <ButtonLink href={classesHref} variant="accent" size="sm">
            <Calendar className="h-4 w-4" />
            See {firstName}&rsquo;s classes
          </ButtonLink>
        ) : null}

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
            variant={following ? "secondary" : ended ? "secondary" : "accent"}
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
          <ButtonLink href={signInHref} variant={ended ? "secondary" : "accent"} size="sm">
            <UserPlus className="h-4 w-4" />
            Follow
          </ButtonLink>
        )}

        {!ended ? (
          <Link
            href={exploreHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/90 underline-offset-4 hover:underline"
          >
            <Compass className="h-4 w-4" />
            Explore more
          </Link>
        ) : null}
      </div>
    </div>
  );
}
