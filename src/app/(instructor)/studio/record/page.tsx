import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db, instructorProfiles } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHeader, Alert } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { PromoRecorder } from "@/components/promo-recorder";

export const metadata: Metadata = { title: "Record a promo clip" };

/**
 * A vertical clip an instructor records here and posts somewhere else.
 *
 * Deliberately not a video library. The file is composed in the browser and
 * saved straight to the device — it never reaches our servers, which is what
 * makes the feature free to run and what makes it useful: the destination is
 * Instagram, WhatsApp or Shorts, where their students already are, with their
 * page address burned into the frame so a reshared clip still leads back here.
 */
export default async function RecordPage() {
  const user = await requireInstructor();

  const profile = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, user.instructorProfileId),
    columns: { slug: true, isPublished: true },
  });

  const slug = profile?.slug ?? "";
  // Shown inside the video, so it has to be what someone would actually type,
  // without the scheme — "personalise.app/i/ananya-iyer" reads as an address a
  // person can retype from a screen; the https:// prefix does not.
  const bookingUrl = `${env.appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/i/${slug}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a promo clip"
        description="A short vertical video for Reels, Shorts or WhatsApp Status — recorded here, saved straight to your device."
        actions={
          slug ? (
            <ButtonLink href={`/i/${slug}`} variant="secondary" size="sm">
              View my page
            </ButtonLink>
          ) : undefined
        }
      />

      {/* An unpublished page makes the link in the clip a dead end, which is
          worse than no link — so say it here rather than after they have
          recorded, filmed themselves, and posted it. */}
      {profile && !profile.isPublished ? (
        <Alert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your page isn&rsquo;t published yet, so the link on the clip
              won&rsquo;t work for anyone who sees it.
            </span>
            <ButtonLink href="/studio/profile" size="sm">
              Publish my page
            </ButtonLink>
          </div>
        </Alert>
      ) : null}

      <PromoRecorder
        instructorName={user.name}
        bookingUrl={bookingUrl}
        slug={slug}
      />
    </div>
  );
}
