import Link from "next/link";
import { Lock, PlayCircle } from "lucide-react";

import { VIDEO_TYPE_LABEL } from "@/lib/enums";
import { formatRelative } from "@/lib/time";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export type VideoCardData = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  visibility: string;
  viewCount: number;
  publishedAt: Date;
  instructorSlug: string;
  instructorName: string;
  instructorAvatar: string | null;
};

function formatVideoDuration(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoCard({ video }: { video: VideoCardData }) {
  const gated = video.visibility !== "PUBLIC";

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/videos/${video.id}`}>
        <div className="relative aspect-video overflow-hidden bg-brand-800">
          {video.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 [background-image:radial-gradient(circle_at_30%_30%,#4f9d80_0,transparent_55%),radial-gradient(circle_at_75%_65%,#e08c3a_0,transparent_50%)] opacity-70" />
          )}
          <div className="absolute inset-0 grid place-items-center">
            <PlayCircle className="h-11 w-11 text-white/90 transition-transform group-hover:scale-110" />
          </div>
          {video.durationSec ? (
            <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {formatVideoDuration(video.durationSec)}
            </span>
          ) : null}
          {gated ? (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <Lock className="h-3 w-3" />
              Students only
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2">
            <Badge tone="soft">{VIDEO_TYPE_LABEL[video.type] ?? video.type}</Badge>
            <span className="text-xs text-ink-faint">
              {formatRelative(video.publishedAt)}
            </span>
          </div>

          <h3 className="mt-2 line-clamp-2 font-medium leading-snug text-ink group-hover:text-brand-700">
            {video.title}
          </h3>

          <div className="mt-2.5 flex items-center gap-2 text-xs text-ink-soft">
            <Avatar
              name={video.instructorName}
              src={video.instructorAvatar}
              size="sm"
            />
            {video.instructorName}
          </div>
        </div>
      </Link>
    </Card>
  );
}
