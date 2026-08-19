import { addDays, zonedParts, zonedToUtc } from "./time";
import { parseList } from "./utils";

/**
 * Pure recurrence math — no database, no server-only imports, so it can be used
 * from the seed script, from tests, and from the schedule preview in the studio
 * UI as well as from the server-side materializer.
 */

export type RulePattern = {
  daysOfWeek: string; // JSON number[] — 0 = Sunday
  startTimeMinutes: number;
  timezone: string;
  startDate: Date;
  endDate: Date | null;
};

/**
 * Expand a rule into the UTC start instants falling inside [from, until].
 *
 * The time-of-day is interpreted in the *rule's* timezone, so a 6:30am class
 * stays 6:30am for the instructor even across a daylight-saving boundary.
 */
export function expandRuleOccurrences(
  rule: RulePattern,
  from: Date,
  until: Date,
): Date[] {
  const days = new Set(parseList<number>(rule.daysOfWeek));
  if (days.size === 0) return [];

  const windowStart = new Date(Math.max(from.getTime(), rule.startDate.getTime()));
  const windowEnd = rule.endDate
    ? new Date(Math.min(until.getTime(), rule.endDate.getTime()))
    : until;
  if (windowStart > windowEnd) return [];

  const out: Date[] = [];
  const seen = new Set<number>();

  // Walk local calendar days, starting a day early and ending a day late so a
  // timezone offset can never clip the first or last occurrence.
  let cursor = addDays(windowStart, -1);
  const hardStop = addDays(windowEnd, 1);

  while (cursor <= hardStop) {
    const p = zonedParts(cursor, rule.timezone);
    if (days.has(p.weekday)) {
      const startsAt = zonedToUtc(
        p.year,
        p.month,
        p.day,
        rule.startTimeMinutes,
        rule.timezone,
      );
      const t = startsAt.getTime();
      if (
        !seen.has(t) &&
        startsAt >= windowStart &&
        startsAt <= windowEnd &&
        startsAt >= rule.startDate &&
        (!rule.endDate || startsAt <= rule.endDate)
      ) {
        seen.add(t);
        out.push(startsAt);
      }
    }
    cursor = addDays(cursor, 1);
  }

  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** "Mon, Wed & Fri" from a JSON day list. */
export function describeDays(daysOfWeekJson: string): string {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = parseList<number>(daysOfWeekJson).sort((a, b) => a - b);
  if (days.length === 0) return "No days set";
  if (days.length === 7) return "Every day";
  const names = days.map((d) => labels[d] ?? "?");
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
