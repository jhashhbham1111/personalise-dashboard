import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { Eye, Lock } from "lucide-react";

import { db, enrollments, instructorProfiles, users, videoAssets } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getFollowState, getVideoLikeState } from "@/lib/engagement";
import { listVideos } from "@/lib/queries";
import { EnrollmentStatus, VIDEO_TYPE_LABEL, Visibility } from "@/lib/enums";
import { instructorIsPublic } from "@/lib/instructor-visibility";
import { videoJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { formatRelative } from "@/lib/time";
import { parseList } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VideoCard } from "@/components/video-card";
import { VideoPlayer } from "@/components/video-player";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await db.query.videoAssets.findFirst({
    where: eq(videoAssets.id, id),
  });
  if (!video) return { title: "Video not found" };

  const description =
    video.description?.trim().slice(0, 300) ||
    `Watch ${video.title} on Personalise.`;

  return {
    title: video.title,
    description,
    alternates: { canonical: `/videos/${id}` },
    /*
     * Only public videos belong in the index. An ENROLLED_ONLY or PAID
     * recording renders a locked page to a crawler, which is thin content
     * pointing at something nobody signed out can watch.
     */
    robots:
      video.visibility === Visibility.PUBLIC
        ? undefined
        : { index: false, follow: false },
    openGraph: {
      type: "video.other",
      title: video.title,
      description,
      url: `/videos/${id}`,
      images: video.thumbnailUrl ? [{ url: video.thumbnailUrl }] : undefined,
    },
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select({
      video: videoAssets,
      instructor: instructorProfiles,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
    })
    .from(videoAssets)
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, videoAssets.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(eq(videoAssets.id, id))
    .limit(1);

  if (!row) notFound();

  const viewer = await getCurrentUser();
  const { video, instructor, instructorName, instructorAvatar } = row;

  // Suspended instructors' videos disappear with the rest of their page.
  if (instructor.isSuspended) notFound();

  // Gating is decided here, not in the template: a locked video never has its
  // URL rendered to the page at all.
  let canWatch = video.visibility === Visibility.PUBLIC;
  if (!canWatch && viewer) {
    if (viewer.instructorProfileId === instructor.id) {
      canWatch = true;
    } else {
      const enrolled = await db.query.enrollments.findFirst({
        where: and(
          eq(enrollments.studentId, viewer.id),
          eq(enrollments.instructorId, instructor.id),
          eq(enrollments.status, EnrollmentStatus.ACTIVE),
        ),
      });
      canWatch = !!enrolled;
    }
  }

  const [more, likeState, following] = await Promise.all([
    listVideos({
      instructorId: instructor.id,
      viewerId: viewer?.id ?? null,
      limit: 4,
    }).then((rows) => rows.filter((v) => v.id !== video.id)),
    getVideoLikeState(video.id, viewer?.id ?? null),
    getFollowState(instructor.id, viewer?.id ?? null),
  ]);
  const instructorDiscipline = parseList<string>(instructor.disciplines)[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {video.visibility === Visibility.PUBLIC && instructorIsPublic(instructor) ? (
        <JsonLd
          data={videoJsonLd({
            id: video.id,
            title: video.title,
            description: video.description,
            thumbnailUrl: video.thumbnailUrl,
            publishedAt: video.publishedAt,
            durationSec: video.durationSec,
            instructorName,
          })}
        />
      ) : null}

      <nav className="mb-5 text-sm text-ink-soft">
        <Link href="/videos" className="hover:text-brand-700">
          Videos
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <Link href={`/i/${instructor.slug}`} className="hover:text-brand-700">
          {instructorName}
        </Link>
      </nav>

      {canWatch ? (
        <VideoPlayer
          src={video.url}
          poster={video.thumbnailUrl}
          videoId={video.id}
          instructorId={instructor.id}
          instructorName={instructorName}
          instructorDiscipline={instructorDiscipline}
          viewerSignedIn={!!viewer}
          initialLiked={likeState.liked}
          initialLikeCount={likeState.count}
          initialFollowing={following}
        />
      ) : (
        <Card className="flex aspect-video flex-col items-center justify-center gap-3 border-dashed bg-surface text-center">
          <Lock className="h-8 w-8 text-ink-faint" />
          <div>
            <p className="font-semibold text-ink">This one is for students</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
              Class recordings are available to people enrolled with{" "}
              {instructorName}.
            </p>
          </div>
          <ButtonLink
            href={viewer ? `/i/${instructor.slug}` : `/login?next=/videos/${video.id}`}
            className="mt-1"
          >
            {viewer ? "See classes & passes" : "Sign in"}
          </ButtonLink>
        </Card>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge tone="soft">{VIDEO_TYPE_LABEL[video.type] ?? video.type}</Badge>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
          <Eye className="h-3.5 w-3.5" />
          {video.viewCount.toLocaleString("en-IN")} views
        </span>
        <span className="text-xs text-ink-faint">
          · {formatRelative(video.publishedAt)}
        </span>
      </div>

      <h1 className="mt-2 text-2xl font-semibold text-ink">{video.title}</h1>
      {video.description ? (
        <p className="mt-2 leading-relaxed text-ink-soft">{video.description}</p>
      ) : null}

      <Link
        href={`/i/${instructor.slug}`}
        className="mt-5 flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-brand-300"
      >
        <Avatar name={instructorName} src={instructorAvatar} size="lg" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{instructorName}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
            {instructor.headline}
          </p>
        </div>
      </Link>

      {more.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            More from {instructorName.split(" ")[0]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {more.slice(0, 3).map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
