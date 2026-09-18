import type { Metadata } from "next";
import { and, asc, desc, eq } from "drizzle-orm";
import { Eye, Film, Lock } from "lucide-react";

import { db, offerings, videoAssets } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { VIDEO_TYPE_LABEL, VISIBILITY_LABEL } from "@/lib/enums";
import { formatRelative } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { VideoDialog } from "./video-dialog";
import { DeleteVideoButton } from "./delete-video-button";

export const metadata: Metadata = { title: "Videos" };

export default async function MediaPage() {
  const user = await requireInstructor();

  const [videos, offeringRows] = await Promise.all([
    db.query.videoAssets.findMany({
      where: eq(videoAssets.instructorId, user.instructorProfileId),
      orderBy: [desc(videoAssets.publishedAt)],
    }),
    db
      .select({ id: offerings.id, title: offerings.title })
      .from(offerings)
      .where(
        and(
          eq(offerings.instructorId, user.instructorProfileId),
          eq(offerings.isActive, true),
        ),
      )
      .orderBy(asc(offerings.title)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Videos"
        description="Vlogs, technique breakdowns and class recordings. Choose who can see each one."
        actions={
          <VideoDialog offerings={offeringRows} triggerLabel="Add a video" showIcon />
        }
      />

      {videos.length === 0 ? (
        <EmptyState
          icon={<Film className="h-8 w-8" />}
          title="Nothing published yet"
          description="Upload a video from your phone or computer, or paste a link if you already host it somewhere — a public vlog brings new students in, a class recording keeps existing ones going."
          action={
            <VideoDialog offerings={offeringRows} triggerLabel="Add your first video" />
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {videos.map((v) => (
            <div key={v.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="soft">
                    {VIDEO_TYPE_LABEL[v.type] ?? v.type}
                  </Badge>
                  <Badge tone={v.visibility === "PUBLIC" ? "success" : "warning"}>
                    {v.visibility === "PUBLIC" ? null : (
                      <Lock className="h-3 w-3" />
                    )}
                    {VISIBILITY_LABEL[v.visibility] ?? v.visibility}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                    <Eye className="h-3 w-3" />
                    {v.viewCount.toLocaleString("en-IN")}
                  </span>
                </div>

                <p className="mt-1.5 font-medium text-ink">{v.title}</p>
                {v.description ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                    {v.description}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-xs text-ink-faint">
                  {v.url} · published {formatRelative(v.publishedAt)}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <VideoDialog
                  offerings={offeringRows}
                  video={{
                    id: v.id,
                    title: v.title,
                    description: v.description,
                    url: v.url,
                    type: v.type,
                    visibility: v.visibility,
                    thumbnailUrl: v.thumbnailUrl,
                    durationSec: v.durationSec,
                    offeringId: v.offeringId,
                  }}
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                  triggerSize="sm"
                />
                <DeleteVideoButton videoId={v.id} title={v.title} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-ink-faint">
        Upload straight from your device — anything over 10 MB is compressed
        automatically, up to a 50 MB original — or paste a link if you already
        host a video elsewhere. Recordings marked &ldquo;Enrolled
        students&rdquo; are only ever served to people with an active pass with
        you.
      </p>
    </div>
  );
}
