import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { db, passCodes } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatPassCode } from "@/lib/pass-codes-format";
import { formatMoney } from "@/lib/utils";
import { formatLongDate } from "@/lib/time";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print pass codes" };

/**
 * A sheet of unredeemed codes to print and cut up.
 *
 * The Studio page told instructors to "print or message a code" and gave them
 * no way to print — the only route was browser-printing a paginated table of
 * every code including the spent ones. This shows exactly the codes still
 * worth handing out, one card each, with the terms on the card so a student
 * holding a slip of paper knows what it is.
 *
 * Deliberately unpaginated: a print sheet that stops at 40 of your 60 codes is
 * worse than no print sheet, because you can't tell which 20 are missing.
 */
export default async function PrintCodesPage() {
  const user = await requireInstructor();

  const codes = await db
    .select()
    .from(passCodes)
    .where(
      and(
        eq(passCodes.instructorId, user.instructorProfileId),
        eq(passCodes.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(passCodes.createdAt));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Screen-only chrome — `print:hidden` keeps it off the paper. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Unused pass codes ({codes.length})
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Print, cut along the lines, and hand one over when someone pays you.
            Redeemed and revoked codes aren&rsquo;t shown.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/studio/codes"
            className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            Back
          </Link>
          {codes.length > 0 ? <PrintButton /> : null}
        </div>
      </div>

      {codes.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-soft print:hidden">
          No unused codes. Create some from Studio → Pass codes.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {codes.map((code) => (
            <div
              key={code.id}
              className="break-inside-avoid rounded-lg border border-dashed border-line-strong p-3 text-center print:border-neutral-400"
            >
              <p className="truncate text-[11px] uppercase tracking-wide text-ink-faint">
                {code.label}
              </p>
              <p className="my-2 font-mono text-lg font-semibold tracking-widest text-ink">
                {formatPassCode(code.code)}
              </p>
              <p className="text-[11px] text-ink-soft">
                {code.sessionsIncluded === null
                  ? "Unlimited classes"
                  : `${code.sessionsIncluded} class${code.sessionsIncluded === 1 ? "" : "es"}`}
                {code.validityDays ? ` · ${code.validityDays} days` : ""}
                {" · "}
                {formatMoney(code.amountPaise)}
              </p>
              {/* The path, not a bare instruction: someone holding this slip a
                  week later needs to know where to type it. */}
              <p className="mt-2 border-t border-line pt-2 text-[10px] leading-snug text-ink-faint">
                Redeem at {env.appUrl.replace(/^https?:\/\//, "")}/dashboard/redeem
              </p>
              {code.expiresAt ? (
                <p className="mt-1 text-[10px] text-ink-faint">
                  Use before {formatLongDate(code.expiresAt, user.timezone)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
