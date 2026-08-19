import "server-only";

import { and, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";

import { availabilityExceptions, classSessions, db, scheduleRules } from "@/db";
import { SessionStatus } from "./enums";
import { expandRuleOccurrences } from "./recurrence";
import { addDays, addMinutes, zonedParts } from "./time";

export { expandRuleOccurrences };

/**
 * Schedule materialization.
 *
 * A ScheduleRule ("Mon/Wed/Fri at 6:30am IST from 1 Sep, no end date") is a
 * pattern, not rows. Concrete ClassSession rows are generated for a rolling
 * horizon — far enough ahead that students can book, not so far that the table
 * grows without bound.
 *
 * Runs when a rule is created or edited, and from GET /api/cron/generate-sessions
 * to keep the horizon rolling forward.
 */

export const DEFAULT_HORIZON_DAYS = 60;

/**
 * Create any missing ClassSession rows for a rule, up to the horizon.
 *
 * Idempotent: safe to call repeatedly. Never duplicates, and never touches
 * sessions that already exist — so an instructor's per-session edits and
 * cancellations survive re-materialization.
 */
export async function materializeSessions(
  ruleId: string,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<number> {
  const rule = await db.query.scheduleRules.findFirst({
    where: eq(scheduleRules.id, ruleId),
    with: { offering: { columns: { title: true, capacity: true } } },
  });
  if (!rule || !rule.isActive) return 0;

  const now = new Date();
  const until = addDays(now, horizonDays);

  const occurrences = expandRuleOccurrences(rule, now, until);
  if (occurrences.length === 0) return 0;

  // Blocked days (holidays, travel) are skipped entirely.
  const exceptions = await db
    .select({ date: availabilityExceptions.date })
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.instructorId, rule.instructorId));

  const blocked = new Set(
    exceptions.map((e) => {
      const p = zonedParts(e.date, rule.timezone);
      return `${p.year}-${p.month}-${p.day}`;
    }),
  );

  const existing = await db
    .select({ startsAt: classSessions.startsAt })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.scheduleRuleId, ruleId),
        gte(classSessions.startsAt, now),
        lte(classSessions.startsAt, until),
      ),
    );
  const known = new Set(existing.map((s) => s.startsAt.getTime()));

  const toCreate = occurrences.filter((startsAt) => {
    if (known.has(startsAt.getTime())) return false;
    const p = zonedParts(startsAt, rule.timezone);
    return !blocked.has(`${p.year}-${p.month}-${p.day}`);
  });

  if (toCreate.length > 0) {
    await db.insert(classSessions).values(
      toCreate.map((startsAt) => ({
        offeringId: rule.offeringId,
        instructorId: rule.instructorId,
        scheduleRuleId: rule.id,
        title: rule.offering.title,
        startsAt,
        endsAt: addMinutes(startsAt, rule.durationMin),
        mode: rule.mode,
        venueId: rule.venueId,
        capacity: rule.offering.capacity,
        status: SessionStatus.SCHEDULED,
      })),
    );
  }

  await db
    .update(scheduleRules)
    .set({ lastMaterializedTo: until })
    .where(eq(scheduleRules.id, ruleId));

  return toCreate.length;
}

/** Roll every active rule's horizon forward. Used by the cron endpoint. */
export async function materializeAllRules(
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): Promise<{ rules: number; created: number }> {
  const rules = await db
    .select({ id: scheduleRules.id })
    .from(scheduleRules)
    .where(eq(scheduleRules.isActive, true));

  let created = 0;
  for (const r of rules) created += await materializeSessions(r.id, horizonDays);
  return { rules: rules.length, created };
}

/**
 * Sessions the instructor is already committed to that overlap this window.
 * Stops one person being scheduled to teach two classes at once.
 */
export async function findConflictingSessions(args: {
  instructorId: string;
  startsAt: Date;
  endsAt: Date;
  excludeSessionId?: string;
}) {
  return db
    .select({
      id: classSessions.id,
      title: classSessions.title,
      startsAt: classSessions.startsAt,
      endsAt: classSessions.endsAt,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.instructorId, args.instructorId),
        inArray(classSessions.status, [SessionStatus.SCHEDULED, SessionStatus.LIVE]),
        args.excludeSessionId
          ? ne(classSessions.id, args.excludeSessionId)
          : undefined,
        lt(classSessions.startsAt, args.endsAt),
        gt(classSessions.endsAt, args.startsAt),
      ),
    );
}
