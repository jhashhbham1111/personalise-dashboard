/**
 * Shared shape for server-action results.
 *
 * Server actions return this instead of throwing, so forms can render an inline
 * error without an error boundary swallowing the page.
 */
export type ActionState = {
  error?: string;
  success?: string;
  /** Field-level messages, keyed by input name. */
  fields?: Record<string, string>;
};

export const emptyState: ActionState = {};

export function fail(error: string, fields?: Record<string, string>): ActionState {
  return { error, fields };
}

export function ok(success?: string): ActionState {
  return { success };
}

/** Read a trimmed string from FormData. */
export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function num(form: FormData, key: string, fallback = 0): number {
  const v = Number(str(form, key));
  return Number.isFinite(v) ? v : fallback;
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function strList(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

/**
 * Coerces a form value to one of an enum object's values, or the fallback.
 *
 * A `<select>` only ever offers valid options, but FormData is just whatever
 * was POSTed — so without this, a crafted request writes arbitrary strings
 * into columns the rest of the app treats as closed sets, and the bad value
 * only surfaces later as a label that renders blank or a filter that can never
 * match.
 */
export function pickEnum<T extends Record<string, string>>(
  value: string,
  allowed: T,
  fallback: T[keyof T],
): T[keyof T] {
  return (Object.values(allowed) as string[]).includes(value)
    ? (value as T[keyof T])
    : fallback;
}

/** Same guard, for a plain list of allowed values. */
export function pickFrom<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Splits a comma-separated textarea into a clean list. */
export function commaList(form: FormData, key: string): string[] {
  return str(form, key)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
