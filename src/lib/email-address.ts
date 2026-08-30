/**
 * What counts as a usable email address at signup.
 *
 * Verification is the real guarantee — a code nobody can read is a code nobody
 * can enter. This file is the cheap filter in front of it, and it earns its
 * place by catching the two cases verification handles badly:
 *
 *   - A typo (`someone@gmial.con`, `me@gmail`) becomes a dead account and a
 *     bounced send against our sending domain's reputation. Saying so in the
 *     form is better than sending mail into the void.
 *   - A throwaway inbox passes verification perfectly well and is worthless
 *     ten minutes later, which is exactly when the class reminder goes out.
 *
 * The blocklist is deliberately small and hand-picked rather than an
 * exhaustive feed: the long tail of throwaway domains is endless, and every
 * entry is a chance to reject a real person's real address, which is a far
 * worse outcome than letting one disposable signup through to the code step.
 */

/**
 * Stricter than the usual `/\S+@\S+\.\S+/`: requires a dot-separated TLD of at
 * least two letters, and rejects a leading, trailing or doubled dot on either
 * side. `me@gmail` and `a@b.c` no longer pass.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Throwaway-inbox services: verifiable now, unreachable in an hour. */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.net",
  "grr.la",
  "sharklasers.com",
  "spam4.me",
  "mailinator.com",
  "mailinator.net",
  "maildrop.cc",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "emailondeck.com",
  "inboxkitten.com",
  "burnermail.io",
]);

/**
 * Domains that exist only in documentation and tests. RFC 2606 reserves these
 * precisely so nobody can own them, which makes an address at one guaranteed
 * undeliverable — `test@example.com` is the single most common dummy signup.
 */
const RESERVED_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "example.edu",
  "test.com",
  "localhost",
  "invalid",
  "test",
  "local",
]);

/**
 * Near-misses for the addresses most Indian students actually use. A typo here
 * is silent — the account is created, the code is sent, and nothing arrives —
 * so it's worth naming the likely intent instead of just refusing.
 */
const TYPO_DOMAINS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.om": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "rediffmial.com": "rediffmail.com",
};

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; error: string };

/**
 * Validate an address for signup.
 *
 * Returns the normalised (trimmed, lowercased) address on success — callers
 * should store *that*, so `Priya@Gmail.com` and `priya@gmail.com` can't become
 * two accounts.
 */
export function checkSignupEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();

  if (!email) return { ok: false, error: "Enter your email address." };
  if (email.length > 254) return { ok: false, error: "That address is too long." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);

  const meant = TYPO_DOMAINS[domain];
  if (meant) {
    return { ok: false, error: `Did you mean @${meant}?` };
  }

  if (RESERVED_DOMAINS.has(domain)) {
    return {
      ok: false,
      error: "Use a real email address — we send your class details there.",
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      ok: false,
      error:
        "Temporary inboxes don't work here — class reminders and your pass codes are sent by email.",
    };
  }

  return { ok: true, email };
}

/** Shape-only check, for forms that look up an existing account (login, reset). */
export function looksLikeEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim().toLowerCase());
}
