import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, Globe, Link2, MapPin, Star } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import {
  enrolledOfferingIds,
  getInstructorBySlug,
  instructorOfferings,
  listPosts,
  listReviews,
  listUpcomingSessions,
  listVideos,
} from "@/lib/queries";
import { DEFAULT_TIMEZONE, formatLongDate, formatRelative } from "@/lib/time";
import { POST_TYPE_LABEL } from "@/lib/enums";
import { parseList, pluralize } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, SectionTitle } from "@/components/ui/page";
import { OfferingCard } from "@/components/offering-card";
import { SessionCard } from "@/components/session-card";
import { VideoCard } from "@/components/video-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getInstructorBySlug(slug);
  if (!row) return { title: "Instructor not found" };
  return {
    title: `${row.user.name} — ${row.profile.headline}`,
    description: row.profile.headline,
  };
}

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getInstructorBySlug(slug);
  // A suspended profile is treated exactly like one that never existed — no
  // "this account is suspended" page, which would only invite speculation.
  if (!row || !row.profile.isPublished || row.profile.isSuspended) notFound();

  const viewer = await getCurrentUser();
  const tz = viewer?.timezone ?? DEFAULT_TIMEZONE;
  const { profile, user } = row;

  const [offerings, sessions, videos, posts, reviews, enrolledIds] =
    await Promise.all([
      instructorOfferings(profile.id),
      listUpcomingSessions({ instructorId: profile.id, limit: 9 }),
      listVideos({ instructorId: profile.id, viewerId: viewer?.id ?? null, limit: 6 }),
      listPosts(profile.id, 6),
      listReviews(profile.id, 6),
      viewer ? enrolledOfferingIds(viewer.id) : Promise.resolve(new Set<string>()),
    ]);

  const cardViewer = { signedIn: !!viewer, enrolledOfferingIds: enrolledIds };

  const disciplines = parseList<string>(profile.disciplines);
  const languages = parseList<string>(profile.languages);
  const certifications = parseList<string>(profile.certifications);
  const rating = profile.ratingAvg / 100;

  return (
    <div>
      {/* -------------------------------------------------------- profile */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar name={user.name} src={user.avatarUrl} size="xl" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold text-ink">{user.name}</h1>
                {profile.isVerified ? (
                  <Badge tone="success">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified
                  </Badge>
                ) : null}
              </div>

              <p className="mt-2 max-w-2xl text-lg leading-relaxed text-ink-soft">
                {profile.headline}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {profile.city}
                </span>
                {profile.ratingCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-accent-500 text-accent-500" />
                    <span className="font-medium text-ink">
                      {rating.toFixed(1)}
                    </span>
                    <span className="text-ink-faint">
                      ({pluralize(profile.ratingCount, "review")})
                    </span>
                  </span>
                ) : null}
                <span>{pluralize(profile.yearsExperience, "year")} teaching</span>
                {languages.length > 0 ? (
                  <span>Speaks {languages.join(", ")}</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {disciplines.map((d) => (
                  <Badge key={d}>{d}</Badge>
                ))}
              </div>

              {(profile.instagramUrl || profile.youtubeUrl || profile.websiteUrl) && (
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  {profile.instagramUrl ? (
                    <SocialLink href={profile.instagramUrl} icon={Link2}>
                      Instagram
                    </SocialLink>
                  ) : null}
                  {profile.youtubeUrl ? (
                    <SocialLink href={profile.youtubeUrl} icon={Link2}>
                      YouTube
                    </SocialLink>
                  ) : null}
                  {profile.websiteUrl ? (
                    <SocialLink href={profile.websiteUrl} icon={Globe}>
                      Website
                    </SocialLink>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-12">
            {/* ------------------------------------------------ offerings */}
            <section id="classes">
              <SectionTitle>What {user.name.split(" ")[0]} teaches</SectionTitle>
              {offerings.length === 0 ? (
                <EmptyState
                  title="No classes published yet"
                  description="This instructor hasn't listed any classes."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {offerings.map((o) => (
                    <OfferingCard key={o.id} offering={o} instructorSlug={slug} />
                  ))}
                </div>
              )}
            </section>

            {/* ------------------------------------------------- schedule */}
            <section id="schedule">
              <SectionTitle
                action={
                  <Link
                    href={`/classes?instructor=${slug}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Full schedule →
                  </Link>
                }
              >
                Upcoming classes
              </SectionTitle>
              {sessions.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="h-7 w-7" />}
                  title="Nothing on the calendar right now"
                  description="Check back soon, or follow along on the updates below."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {sessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      timezone={tz}
                      showInstructor={false}
                      viewer={cardViewer}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* --------------------------------------------------- videos */}
            {videos.length > 0 ? (
              <section id="videos">
                <SectionTitle>Videos & recordings</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {videos.map((v) => (
                    <VideoCard key={v.id} video={v} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* -------------------------------------------------- updates */}
            {posts.length > 0 ? (
              <section id="updates">
                <SectionTitle>Updates</SectionTitle>
                <div className="space-y-3">
                  {posts.map((p) => (
                    <Card key={p.id} className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={p.type === "ANNOUNCEMENT" ? "warning" : "soft"}
                        >
                          {POST_TYPE_LABEL[p.type] ?? p.type}
                        </Badge>
                        <span className="text-xs text-ink-faint">
                          {formatRelative(p.publishedAt)}
                        </span>
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
              </section>
            ) : null}

            {/* -------------------------------------------------- reviews */}
            {reviews.length > 0 ? (
              <section id="reviews">
                <SectionTitle>What students say</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  {reviews.map((r) => (
                    <Card key={r.id} className="p-5">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={
                              i < r.rating
                                ? "h-4 w-4 fill-accent-500 text-accent-500"
                                : "h-4 w-4 text-line-strong"
                            }
                          />
                        ))}
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-ink">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
                        <Avatar
                          name={r.studentName}
                          src={r.studentAvatar}
                          size="sm"
                        />
                        {r.studentName}
                        <span className="text-ink-faint">
                          · {formatRelative(r.createdAt)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* ---------------------------------------------------- sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {profile.bio ? (
              <Card className="p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  About
                </h2>
                <div className="mt-2.5 space-y-3 text-sm leading-relaxed text-ink-soft">
                  {profile.bio.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </Card>
            ) : null}

            {certifications.length > 0 ? (
              <Card className="p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  Training
                </h2>
                <ul className="mt-2.5 space-y-2">
                  {certifications.map((c) => (
                    <li
                      key={c}
                      className="flex gap-2 text-sm leading-relaxed text-ink-soft"
                    >
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      {c}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card className="p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                On the platform since
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                {formatLongDate(profile.createdAt, tz)}
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SocialLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 text-ink-soft hover:text-brand-700"
    >
      <Icon className="h-4 w-4" />
      {children}
    </a>
  );
}
