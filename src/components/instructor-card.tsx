import Link from "next/link";
import { BadgeCheck, MapPin, Star } from "lucide-react";

import type { InstructorCardData } from "@/lib/queries";
import { parseList, pluralize } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function InstructorCard({ instructor }: { instructor: InstructorCardData }) {
  const disciplines = parseList<string>(instructor.disciplines);
  const rating = instructor.ratingAvg / 100;

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <Link href={`/i/${instructor.slug}`} className="block p-5">
        <div className="flex items-start gap-3">
          <Avatar name={instructor.name} src={instructor.avatarUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-semibold text-ink group-hover:text-brand-700">
                {instructor.name}
              </h3>
              {instructor.isVerified ? (
                <BadgeCheck
                  className="h-4 w-4 shrink-0 text-brand-500"
                  aria-label="Verified instructor"
                />
              ) : null}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {instructor.city}
              </span>
              {instructor.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" />
                  <span className="font-medium text-ink">{rating.toFixed(1)}</span>
                  <span className="text-ink-faint">
                    ({instructor.ratingCount})
                  </span>
                </span>
              ) : (
                <span className="text-ink-faint">New instructor</span>
              )}
              <span>{pluralize(instructor.yearsExperience, "year")} teaching</span>
            </div>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-soft">
          {instructor.headline}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {disciplines.slice(0, 4).map((d) => (
            <Badge key={d}>{d}</Badge>
          ))}
        </div>
      </Link>
    </Card>
  );
}
