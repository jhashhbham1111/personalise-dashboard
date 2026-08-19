import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness for uptime monitors and load balancers.
 *
 * Deliberately runs a real query rather than just returning 200: "the process
 * is up" and "the app can actually serve a request" are different states, and
 * the gap between them — process healthy, database unreachable — is exactly
 * the outage that was previously invisible until a user reported a blank page.
 *
 * Returns no configuration detail; it's a public endpoint.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.run(sql`select 1`);
    return NextResponse.json({
      ok: true,
      database: "reachable",
      latencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        latencyMs: Date.now() - startedAt,
        at: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
