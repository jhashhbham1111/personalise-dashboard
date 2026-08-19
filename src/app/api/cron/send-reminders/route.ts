import { NextResponse } from "next/server";

import { authorizeCron } from "@/lib/cron-auth";
import { sendClassReminders } from "@/lib/reminders";

/**
 * Notifies each instructor and every confirmed student about a class starting
 * within the next hour, once per class.
 *
 * Point a cron at this every 5-15 minutes (Vercel Cron, GitHub Actions, or
 * plain crontab):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://your-domain/api/cron/send-reminders
 *
 * Safe to call as often as you like — a class is only ever reminded once
 * (see src/lib/reminders.ts).
 */
export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await sendClassReminders();

  return NextResponse.json({
    ok: true,
    ...result,
    at: new Date().toISOString(),
  });
}
