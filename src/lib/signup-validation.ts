/**
 * Signup field rules, shared by the browser and the server action.
 *
 * Deliberately a plain module with no `server-only` and no database access, so
 * `signup-form.tsx` can import the very same functions `signupAction` runs.
 * The client half exists to answer while someone is still typing; the server
 * half is the one that decides. When the two are written separately they drift
 * — the form accepts something the action then rejects, and the person is told
 * "check the highlighted fields" about a field that looks fine to them.
 *
 * The messages live here for the same reason: an inline error and the error
 * that comes back from a submit should be the same sentence, or it reads as
 * two different complaints about one mistake.
 */

import { checkSignupEmail } from "./email-address";

export const MIN_NAME_LENGTH = 2;
export const MIN_PASSWORD_LENGTH = 8;
/** Short enough for the world's shortest national numbers, long enough to catch a slip. */
export const MIN_PHONE_DIGITS = 7;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keeps digits and a leading +, so "+91 98765 43210" and "09876543210" match. */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus ? "+" : ""}${digits}` : "";
}

export function validateName(raw: string): string | null {
  return raw.trim().length < MIN_NAME_LENGTH ? "Tell us your name." : null;
}

/**
 * Delegates to the real rule rather than re-stating a weaker one.
 *
 * A shape regex here would accept `test@example.com`, `someone@mailinator.com`
 * and `priya@gmial.com` — the three cases signup exists to refuse, since a
 * code sent to any of them is a code nobody reads. `checkSignupEmail` is a
 * plain module with no server imports, so the browser can run the identical
 * check: the "Did you mean @gmail.com?" that used to need a round trip now
 * appears while the address is still being typed.
 */
export function validateEmail(raw: string): string | null {
  const check = checkSignupEmail(raw);
  return check.ok ? null : check.error;
}

export function validatePassword(raw: string): string | null {
  return raw.length < MIN_PASSWORD_LENGTH
    ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    : null;
}

/** Optional field: empty is valid, anything present has to look like a number. */
export function validatePhone(raw: string): string | null {
  const phone = normalisePhone(raw);
  if (!phone) return null;
  return phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS
    ? "That doesn't look like a phone number."
    : null;
}

export type SignupValues = {
  name: string;
  email: string;
  password: string;
  phone: string;
};

/** Every field's error at once, keyed the way ActionState.fields expects. */
export function validateSignup(values: SignupValues): Record<string, string> {
  const fields: Record<string, string> = {};
  const name = validateName(values.name);
  const email = validateEmail(values.email);
  const password = validatePassword(values.password);
  const phone = validatePhone(values.phone);

  if (name) fields.name = name;
  if (email) fields.email = email;
  if (password) fields.password = password;
  if (phone) fields.phone = phone;

  return fields;
}
