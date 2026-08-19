import type { Metadata } from "next";
import { and, count, eq } from "drizzle-orm";
import { BadgeCheck } from "lucide-react";

import { db, instructorProfiles, offerings } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { parseList } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { ProfileForm } from "./profile-form";
import { PublishToggle } from "./publish-toggle";

export const metadata: Metadata = { title: "Public page" };

export default async function StudioProfilePage() {
  const user = await requireInstructor();

  const profile = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.id, user.instructorProfileId),
  });
  if (!profile) return null;

  const [offeringCount] = await db
    .select({ n: count() })
    .from(offerings)
    .where(
      and(
        eq(offerings.instructorId, user.instructorProfileId),
        eq(offerings.isActive, true),
      ),
    );

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Public page"
        description="What students see before they decide to book with you."
      />

      <PublishToggle
        isPublished={profile.isPublished}
        slug={profile.slug}
        canPublish={(offeringCount?.n ?? 0) > 0}
        isSuspended={profile.isSuspended}
        suspendedReason={profile.suspendedReason}
      />

      <Card className="flex items-start gap-3 p-4">
        <BadgeCheck
          className={
            profile.isVerified
              ? "mt-0.5 h-5 w-5 shrink-0 text-brand-500"
              : "mt-0.5 h-5 w-5 shrink-0 text-ink-faint"
          }
        />
        <div>
          <p className="text-sm font-medium text-ink">
            {profile.isVerified ? "Verified instructor" : "Not yet verified"}
            {profile.isVerified ? null : (
              <Badge tone="warning" className="ml-2">
                Pending review
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {profile.isVerified
              ? "Students see a verified badge on your profile and in search results."
              : "An admin reviews new instructors before adding the verified badge. You can teach and take bookings in the meantime."}
          </p>
        </div>
      </Card>

      <ProfileForm
        initial={{
          headline: profile.headline,
          bio: profile.bio,
          city: profile.city,
          yearsExperience: profile.yearsExperience,
          disciplines: parseList<string>(profile.disciplines),
          languages: parseList<string>(profile.languages),
          certifications: parseList<string>(profile.certifications),
          instagramUrl: profile.instagramUrl,
          youtubeUrl: profile.youtubeUrl,
          websiteUrl: profile.websiteUrl,
        }}
      />

      <p className="text-xs text-ink-faint">
        Your page lives at{" "}
        <span className="font-mono text-ink-soft">/i/{profile.slug}</span>. Share
        that link anywhere — it&rsquo;s the only one students need.
      </p>
    </div>
  );
}
