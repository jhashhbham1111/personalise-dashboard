import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Megaphone } from "lucide-react";

import { db, posts } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { POST_TYPE_LABEL, VISIBILITY_LABEL } from "@/lib/enums";
import { formatDateTime, formatRelative } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { PostComposer } from "./post-composer";
import { DeletePostButton } from "./delete-post-button";

export const metadata: Metadata = { title: "Updates" };

export default async function UpdatesPage() {
  const user = await requireInstructor();

  const rows = await db.query.posts.findMany({
    where: eq(posts.instructorId, user.instructorProfileId),
    orderBy: [desc(posts.publishedAt)],
    limit: 60,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Updates"
        description="What's on today, a class cancellation, or something longer worth writing down. Everything here appears on your public page."
      />

      <PostComposer />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="Nothing posted yet"
          description="A short daily note is the easiest way to keep students coming back to your page."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={p.type === "ANNOUNCEMENT" ? "warning" : "soft"}>
                    {POST_TYPE_LABEL[p.type] ?? p.type}
                  </Badge>
                  {p.visibility !== "PUBLIC" ? (
                    <Badge tone="neutral">
                      {VISIBILITY_LABEL[p.visibility] ?? p.visibility}
                    </Badge>
                  ) : null}
                  <span
                    className="text-xs text-ink-faint"
                    title={formatDateTime(p.publishedAt, user.timezone)}
                  >
                    {formatRelative(p.publishedAt)}
                  </span>
                </div>
                <DeletePostButton postId={p.id} title={p.title} />
              </div>

              <h3 className="mt-2 font-semibold text-ink">{p.title}</h3>
              <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink-soft">
                {p.body.split("\n\n").map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
