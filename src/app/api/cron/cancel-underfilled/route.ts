import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron-auth";
import { cancelUnderfilledSessions } from "@/lib/underfilled";

/**
 * Cancels SCHEDULED classes that won't reach their offering's minimum
 * headcount before they start, refunds every booked student's credit (the
 * same mechanism an instructor's own cancellation uses), and notifies
 * everyone involved.
 *
 * Point a cron at this every 15-30 minutes:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://your-domain/api/cron/cancel-underfilled
 *
 * Safe to call as often as you like — a class only ever cancels once (see
 * src/lib/underfilled.ts).
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await cancelUnderfilledSessions();

  return NextResponse.json({
    ok: true,
    ...result,
    at: new Date().toISOString(),
  });
}
