import "server-only";

import { and, count, eq } from "drizzle-orm";

import {
  db,
  instructorFollows,
  instructorProfiles,
  users,
  videoAssets,
  videoLikes,
} from "@/db";
import { NotificationType } from "./enums";
import { notify } from "./notify";

/**
 * Likes and follows for the video-discovery flow (browse a discipline, land on
 * an instructor's videos, like/follow while watching). Kept separate from
 * enrolments and bookings — a follow is free and carries no access rights, so
 * it must never be confused with the paid relationship those tables model.
 */

export async function getVideoLikeState(
  videoId: string,
  userId: string | null,
): Promise<{ liked: boolean; count: number }> {
  const [{ value: likeCount }] = await db
    .select({ value: count() })
    .from(videoLikes)
    .where(eq(videoLikes.videoId, videoId));

  if (!userId) return { liked: false, count: likeCount };

  const existing = await db.query.videoLikes.findFirst({
    where: and(eq(videoLikes.videoId, videoId), eq(videoLikes.userId, userId)),
  });

  return { liked: !!existing, count: likeCount };
}

export async function toggleVideoLike(
  videoId: string,
  userId: string,
): Promise<{ liked: boolean; count: number }> {
  const existing = await db.query.videoLikes.findFirst({
    where: and(eq(videoLikes.videoId, videoId), eq(videoLikes.userId, userId)),
  });

  if (existing) {
    await db.delete(videoLikes).where(eq(videoLikes.id, existing.id));
  } else {
    // The video itself might have been deleted between page load and click;
    // liking a row that no longer exists would otherwise leave an orphan.
    const video = await db.query.videoAssets.findFirst({
      where: eq(videoAssets.id, videoId),
      columns: { id: true },
    });
    if (!video) return { liked: false, count: 0 };
    await db.insert(videoLikes).values({ videoId, userId });
  }

  return getVideoLikeState(videoId, userId);
}

export async function getFollowState(
  instructorId: string,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const existing = await db.query.instructorFollows.findFirst({
    where: and(
      eq(instructorFollows.instructorId, instructorId),
      eq(instructorFollows.followerId, userId),
    ),
  });
  return !!existing;
}

export async function toggleInstructorFollow(
  instructorId: string,
  followerId: string,
): Promise<{ following: boolean }> {
  const existing = await db.query.instructorFollows.findFirst({
    where: and(
      eq(instructorFollows.instructorId, instructorId),
      eq(instructorFollows.followerId, followerId),
    ),
  });

  if (existing) {
    await db.delete(instructorFollows).where(eq(instructorFollows.id, existing.id));
    return { following: false };
  }

  const instructor = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, instructorId),
    columns: { userId: true },
  });
  if (!instructor) return { following: false };

  await db.insert(instructorFollows).values({ instructorId, followerId });

  if (instructor.userId !== followerId) {
    const follower = await db.query.users.findFirst({
      where: eq(users.id, followerId),
      columns: { name: true },
    });
    await notify({
      userId: instructor.userId,
      type: NotificationType.NEW_FOLLOWER,
      title: "You have a new follower",
      body: `${follower?.name ?? "Someone"} started following you.`,
    });
  }

  return { following: true };
}
