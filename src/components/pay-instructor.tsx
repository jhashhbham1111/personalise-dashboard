"use client";

import { useState } from "react";
import { Check, Copy, Landmark, QrCode, Smartphone } from "lucide-react";

/**
 * The "how do I actually pay you?" panel on the enrol page.
 *
 * While money is offline this is the whole transaction. It used to say "pay
 * your instructor directly" and stop there — no UPI ID, no account number,
 * nothing — so a student who had decided to buy had no way to act on it.
 *
 * The QR is passed in already rendered (from the instructor's UPI ID, server
 * side) and the ID is shown next to it as text with a copy button, because
 * plenty of people pay on the same phone they're browsing on and can't scan
 * their own screen.
 */
export function PayInstructor({
  instructorName,
  upiId,
  upiQrDataUri,
  bankDetails,
  paymentNote,
}: {
  instructorName: string;
  upiId: string | null;
  upiQrDataUri: string | null;
  bankDetails: string | null;
  paymentNote: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      /* Clipboard blocked — the value is on screen to copy by hand. */
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line-strong bg-surface p-3.5">
      <p className="text-sm font-medium text-ink">
        Paying {instructorName}
      </p>

      {upiId ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <Smartphone className="h-3.5 w-3.5" />
            UPI
          </div>

          <div className="flex items-start gap-3">
            {upiQrDataUri ? (
              <div className="shrink-0 rounded-md border border-line bg-white p-1.5">
                {/* Data URI, so no next/image loader and no remote fetch. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upiQrDataUri}
                  alt={`UPI QR code for ${upiId}`}
                  className="h-24 w-24"
                />
              </div>
            ) : (
              <div className="grid h-24 w-24 shrink-0 place-items-center rounded-md border border-line text-ink-faint">
                <QrCode className="h-6 w-6" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-soft">
                Scan with any UPI app, or use this ID:
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1.5 font-mono text-sm text-ink">
                  {upiId}
                </code>
                <button
                  type="button"
                  onClick={() => copy(upiId, "upi")}
                  className="shrink-0 rounded-md border border-line-strong p-1.5 text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
                  aria-label="Copy UPI ID"
                >
                  {copied === "upi" ? (
                    <Check className="h-3.5 w-3.5 text-brand-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">
                Enter the amount for the pass you want.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {bankDetails ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <Landmark className="h-3.5 w-3.5" />
            Bank transfer
          </div>
          <div className="flex items-start gap-1.5">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded bg-paper px-2 py-1.5 font-sans text-sm text-ink">
              {bankDetails}
            </pre>
            <button
              type="button"
              onClick={() => copy(bankDetails, "bank")}
              className="shrink-0 rounded-md border border-line-strong p-1.5 text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
              aria-label="Copy bank details"
            >
              {copied === "bank" ? (
                <Check className="h-3.5 w-3.5 text-brand-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      ) : null}

      {paymentNote ? (
        <p className="border-t border-line pt-2.5 text-sm text-ink-soft">
          {paymentNote}
        </p>
      ) : null}
    </div>
  );
}
