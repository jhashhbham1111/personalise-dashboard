import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";

import { db, instructorProfiles, offerings, videoAssets } from "@/db";
import { publiclyVisibleInstructor } from "@/lib/queries";
import { env } from "@/lib/env";
import { Visibility } from "@/lib/enums";

/**
 * The map Google crawls.
 *
 * Every dynamic URL here is filtered by `publiclyVisibleInstructor` — the same
 * SQL predicate the listing pages compose. That matters more than it looks: a
 * sitemap is a public document, so listing an unpublished or suspended
 * instructor would both advertise a page that 404s *and* leak the existence of
 * an account its owner hasn't chosen to publish. Reusing the one predicate is
 * what stops this file drifting into a second, weaker definition of "public".
 *
 * Individual class sessions (/classes/[id]) are deliberately absent. They are
 * dated, they expire within days, and feeding Google thousands of URLs that
 * turn into past events wastes crawl budget on pages nobody can book. The
 * sessions are still discoverable through /classes, and each one carries Event
 * structured data so it can surface on its own merits.
 */

// Rebuilt hourly rather than at build time: a newly verified instructor should
// appear without waiting for the next deploy, but this runs database queries
// and does not need to be recomputed for every crawler hit.
export const revalidate = 3600;

const base = env.appUrl;

/** Pages that exist regardless of what's in the database. */
const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/instructors", priority: 0.9, changeFrequency: "daily" },
  { path: "/classes", priority: 0.9, changeFrequency: "daily" },
  { path: "/videos", priority: 0.7, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/refunds", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [instructors, enrolPages, videos] = await Promise.all([
    db
      .select({
        slug: instructorProfiles.slug,
        updatedAt: instructorProfiles.updatedAt,
      })
      .from(instructorProfiles)
      .where(publiclyVisibleInstructor),

    // An offering is only reachable through its instructor's slug, so this
    // join is what keeps a live class on a hidden profile out of the sitemap.
    db
      .select({
        instructorSlug: instructorProfiles.slug,
        offeringSlug: offerings.slug,
        updatedAt: offerings.updatedAt,
      })
      .from(offerings)
      .innerJoin(
        instructorProfiles,
        eq(instructorProfiles.id, offerings.instructorId),
      )
      .where(and(publiclyVisibleInstructor, eq(offerings.isActive, true))),

    db
      .select({
        id: videoAssets.id,
        publishedAt: videoAssets.publishedAt,
      })
      .from(videoAssets)
      .innerJoin(
        instructorProfiles,
        eq(instructorProfiles.id, videoAssets.instructorId),
      )
      .where(
        and(
          publiclyVisibleInstructor,
          eq(videoAssets.visibility, Visibility.PUBLIC),
        ),
      ),
  ]);

  return [
    ...STATIC_ROUTES.map((r) => ({
      url: `${base}${r.path}`,
      lastModified: new Date(),
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),

    // The pages that actually earn traffic: a real teacher, named, in a city.
    ...instructors.map((i) => ({
      url: `${base}/i/${i.slug}`,
      lastModified: i.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),

    ...enrolPages.map((o) => ({
      url: `${base}/i/${o.instructorSlug}/enrol/${o.offeringSlug}`,
      lastModified: o.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),

    ...videos.map((v) => ({
      url: `${base}/videos/${v.id}`,
      lastModified: v.publishedAt ?? new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
