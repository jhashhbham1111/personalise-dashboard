import type { Metadata } from "next";
import { Film } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { listVideos } from "@/lib/queries";
import { VideoCard } from "@/components/video-card";
import { EmptyState, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Video library",
  description:
    "Free lessons and vlogs from instructors. Class recordings unlock when you enrol.",
};

export default async function VideosPage() {
  const viewer = await getCurrentUser();
  const videos = await listVideos({ viewerId: viewer?.id ?? null, limit: 60 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Video library"
        description={
          viewer
            ? "Free lessons from every instructor, plus recordings from the classes you're enrolled in."
            : "Free lessons and vlogs. Sign in and enrol to unlock class recordings."
        }
      />

      {videos.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Film className="h-8 w-8" />}
          title="No videos yet"
          description="Instructors haven't published anything to the library."
        />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
