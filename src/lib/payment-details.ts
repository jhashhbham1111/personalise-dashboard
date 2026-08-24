import "server-only";

import QRCode from "qrcode";

/**
 * How an instructor gets paid while money is offline.
 *
 * The enrol page's whole job in this mode is to answer "how do I pay?" — so
 * these fields are the difference between a student who pays and one who
 * closes the tab. The QR is generated from the UPI ID here rather than
 * uploaded as an image: an uploaded QR can quietly disagree with the typed ID,
 * can be a screenshot of someone else's, and needs storage this app doesn't
 * have.
 */

export type PaymentDetails = {
  upiId: string | null;
  bankDetails: string | null;
  paymentNote: string | null;
};

/**
 * A UPI ID is `handle@provider` — letters, digits, dots, hyphens and
 * underscores either side. Deliberately loose on the provider: there are
 * dozens (@okhdfcbank, @ybl, @paytm, @axl…) and new ones appear, so an
 * allow-list would reject valid IDs. This only catches the shape being wrong,
 * which is what a typo looks like.
 */
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/;

export function isValidUpiId(raw: string): boolean {
  return UPI_RE.test(raw.trim());
}

export function normaliseUpiId(raw: string): string {
  // UPI handles are case-insensitive and every app displays them lowercase.
  return raw.trim().toLowerCase();
}

/**
 * The payload a UPI app expects behind a QR.
 *
 * `am` (amount) is deliberately omitted: passes have several prices, and a QR
 * locked to one of them is wrong for every other. Leaving it out opens the
 * app with the payee filled in and the amount for the student to type, which
 * is also what a printed shop QR does.
 */
export function upiPaymentUri(upiId: string, payeeName: string): string {
  const params = new URLSearchParams({
    pa: normaliseUpiId(upiId),
    pn: payeeName,
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

/**
 * Renders the UPI QR as a data URI so it can go straight into an <img> with
 * no file storage, no CDN and no extra request.
 *
 * Returns null rather than throwing — a QR that won't render should cost the
 * student the QR, not the whole enrol page. They can still type the UPI ID,
 * which is shown next to it for exactly this reason.
 */
export async function upiQrDataUri(
  upiId: string,
  payeeName: string,
): Promise<string | null> {
  try {
    return await QRCode.toDataURL(upiPaymentUri(upiId, payeeName), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

/** True when there's anything worth showing a student. */
export function hasPaymentDetails(details: PaymentDetails): boolean {
  return !!(details.upiId || details.bankDetails || details.paymentNote);
}
