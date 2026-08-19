import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron-auth";
import { materializeAllRules } from "@/lib/scheduling";

/**
 * Rolls every active schedule rule's session horizon forward.
 *
 * Point a daily cron at this (Vercel Cron, GitHub Actions, or plain crontab):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://your-domain/api/cron/generate-sessions
 *
 * Safe to call as often as you like — materialization is idempotent and never
 * touches sessions that already exist.
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await materializeAllRules();

  return NextResponse.json({
    ok: true,
    rulesProcessed: result.rules,
    sessionsCreated: result.created,
    at: new Date().toISOString(),
  });
}
