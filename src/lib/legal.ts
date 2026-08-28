/**
 * Who legally operates Personalise.
 *
 * Every legal page and the contact page read their identity details from here,
 * so there is exactly one file to edit rather than four documents to keep in
 * step with each other.
 *
 * ⚠️ FILL THESE IN BEFORE:
 *   - submitting the app to Google Play (a privacy policy naming nobody is
 *     rejected), or
 *   - applying to activate a live Razorpay account (they check that Terms,
 *     Privacy, Refunds and Contact are reachable *and* name a real operator
 *     with a working address and phone number).
 *
 * Anything left starting with "TODO:" renders on the page as an amber "needs
 * filling in" badge instead of silently leaving a hole in a sentence — see
 * src/components/legal.tsx. That is deliberate: an unfinished policy reads
 * perfectly well in review, because the sentence around the blank is finished.
 */
export const LEGAL = {
  /** Registered business name, or the individual's full name if unincorporated. */
  operatorName: "TODO: registered name of the business or person operating Personalise",

  /** A mailbox a real person reads. It appears on every legal page. */
  supportEmail: "nirmata@koshcloud.com",

  /** Full postal address, including city, state and PIN code. Razorpay verifies this. */
  address: "TODO: street, city, state, PIN code, India",

  /** A number a customer can actually reach, with country code. */
  phone: "TODO: +91 00000 00000",

  /** The date these documents were last reviewed, e.g. "12 September 2026". */
  lastUpdated: "28 August 2026",
};
