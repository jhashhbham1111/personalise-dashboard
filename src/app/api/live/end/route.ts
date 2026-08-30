import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { bookings, classSessions, db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { Attendance, BookingStatus, SessionStatus } from "@/lib/enums";
import { getLiveProvider, roomNameForSession } from "@/lib/live";
import { getLiveAccess } from "@/lib/live/access";

/**
 * Host ends the class. This is the other half of "attendance auto-marks
 * itself from join events" — everyone who joined was already flipped to
 * ATTENDED by the token route; everyone still PENDING never showed up, so
 * ending the class is what finally resolves them to NO_SHOW.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  // A route handler can't redirect a fetch to the verification screen, so it
  // refuses outright — the pages that would call it are already unreachable
  // to an unverified account, and this closes the direct-POST path.
  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Confirm your email address first." },
      { status: 403 },
    );
  }

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (!body.sessionId) {
    return NextResponse.json({ error: "Missing sessionId." }, { status: 400 });
  }

  const access = await getLiveAccess(body.sessionId, user);
  if (!access.ok) {
    // Ending an already-finished or cancelled class is a no-op success, not
    // an error — the client may race the auto-end timer against a click.
    if (access.reason === "finished" || access.reason === "cancelled") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: access.message },
      { status: access.reason === "not-found" ? 404 : 403 },
    );
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the host can end the class." }, { status: 403 });
  }

  const session = access.detail.session;
  const provider = getLiveProvider();
  const roomName = session.roomName ?? roomNameForSession(session.id);

  await provider.endRoom(roomName).catch(() => undefined);

  await db
    .update(classSessions)
    .set({
      status: SessionStatus.COMPLETED,
      liveEndedAt: new Date(),
      isRecording: false,
    })
    .where(eq(classSessions.id, session.id));

  await db
    .update(bookings)
    .set({ attendance: Attendance.NO_SHOW })
    .where(
      and(
        eq(bookings.sessionId, session.id),
        eq(bookings.status, BookingStatus.CONFIRMED),
        eq(bookings.attendance, Attendance.PENDING),
      ),
    );

  return NextResponse.json({ ok: true });
}
