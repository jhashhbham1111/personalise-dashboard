/**
 * Pass-code formatting — pure, no database, no server-only import.
 *
 * Split out from src/lib/pass-codes.ts so the studio and redemption UIs can
 * display and normalise a code without dragging the whole server module (and
 * its database client) into the browser bundle.
 */

export const PASS_CODE_LENGTH = 8;

/** Formats as XXXX-XXXX; the dash is display only and stripped on input. */
export function formatPassCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/**
 * Strips formatting and normalises what a student typed into a lookup key.
 *
 * No character substitution happens here on purpose. The excluded characters
 * (0/O/1/I/L) never appear in a generated code, so seeing one means the student
 * misread a character — and there's no way to know which one they meant. Fixing
 * it up would risk silently redeeming a different student's code, so a typo is
 * left to fail honestly as "code not found".
 */
export function normalisePassCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, PASS_CODE_LENGTH);
}
