/**
 * Cancellation policy — pure, no database.
 *
 * Kept separate from src/lib/booking.ts so client components can render the
 * policy (and the "you're inside the free window" copy) without pulling the
 * server-only booking module into the browser bundle.
 */

/** A student can cancel free of charge up to this long before the class starts. */
export const FREE_CANCELLATION_HOURS = 4;

export function canCancelFree(startsAt: Date, now: Date = new Date()): boolean {
  return startsAt.getTime() - now.getTime() > FREE_CANCELLATION_HOURS * 3600_000;
}

/** Students can join from 15 minutes before start until 30 minutes after end. */
export const JOIN_WINDOW_BEFORE_MIN = 15;
export const JOIN_WINDOW_AFTER_MIN = 30;

export function isWithinJoinWindow(
  startsAt: Date,
  endsAt: Date,
  now: Date = new Date(),
): boolean {
  const open = startsAt.getTime() - JOIN_WINDOW_BEFORE_MIN * 60_000;
  const close = endsAt.getTime() + JOIN_WINDOW_AFTER_MIN * 60_000;
  const t = now.getTime();
  return t >= open && t <= close;
}
