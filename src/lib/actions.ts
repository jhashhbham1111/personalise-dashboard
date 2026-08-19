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

/** Splits a comma-separated textarea into a clean list. */
export function commaList(form: FormData, key: string): string[] {
  return str(form, key)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
