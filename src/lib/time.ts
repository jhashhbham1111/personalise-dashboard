/**
 * Timezone-correct time helpers.
 *
 * Rule of the codebase: every DateTime in the database is a UTC instant. An
 * instructor's schedule is authored in *their* timezone, and every viewer sees
 * it rendered in *their* timezone. These helpers are the only place that
 * conversion happens.
 *
 * Implemented on Intl rather than a date library so there's no extra dependency
 * and no tz-database version drift with the runtime.
 */

const DEFAULT_TZ = "Asia/Kolkata";

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
export function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // `hour` can come back as 24 for midnight in some ICU versions.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Turn a wall-clock date+time in `tz` into the UTC instant it refers to.
 * Two passes so DST transitions resolve correctly.
 */
export function zonedToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  minutesPastMidnight: number,
  tz: string = DEFAULT_TZ,
): Date {
  const hours = Math.floor(minutesPastMidnight / 60);
  const minutes = minutesPastMidnight % 60;
  const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  let guess = new Date(naive - tzOffsetMs(new Date(naive), tz));
  guess = new Date(naive - tzOffsetMs(guess, tz));
  return guess;
}

/** The calendar date parts of a UTC instant, as seen in `tz`. */
export function zonedParts(instant: Date, tz: string = DEFAULT_TZ) {
  const shifted = new Date(instant.getTime() + tzOffsetMs(instant, tz));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0=Sun
    minutesPastMidnight: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/* ---------- Formatting ---------- */

export function formatTime(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatDate(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatLongDate(d: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(d: Date, tz: string = DEFAULT_TZ): string {
  return `${formatDate(d, tz)}, ${formatTime(d, tz)}`;
}

export function formatDateRange(start: Date, end: Date, tz: string = DEFAULT_TZ): string {
  return `${formatDate(start, tz)} · ${formatTime(start, tz)} – ${formatTime(end, tz)}`;
}

/** "in 2 hours", "3 days ago" */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const diffMs = d.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600_000],
    ["month", 30 * 24 * 3600_000],
    ["day", 24 * 3600_000],
    ["hour", 3600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return "just now";
}

/** "1h 30m" from a minute count. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "06:30" from minutes past midnight — for <input type="time">. */
export function minutesToTimeInput(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "6:30 AM" from minutes past midnight. */
export function formatMinutesOfDay(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 3600_000);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** For <input type="date"> — the yyyy-mm-dd of an instant in `tz`. */
export function toDateInput(d: Date, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function fromDateInput(value: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = value.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, tz);
}

export const DEFAULT_TIMEZONE = DEFAULT_TZ;

export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];
