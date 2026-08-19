import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { bookings, classSessions, db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { Attendance, SessionStatus } from "@/lib/enums";
import { getLiveProvider, roomNameForSession } from "@/lib/live";
import { getLiveAccess } from "@/lib/live/access";

/**
 * Mints a scoped grant to join a class's live room.
 *
 * This is a Route Handler rather than a Server Action because the client
 * room engine needs a plain URL it can call (and re-call, if a token needs
 * refreshing) regardless of which video provider is behind it.
 *
 * Every access rule lives in `getLiveAccess` — this route just enforces the
 * verdict and records the side effect of actually walking in the door: the
 * host's session flips to LIVE, and a student's booking is marked attended.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to join this class." }, { status: 401 });
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
    const status =
      access.reason === "not-found" ? 404 : access.reason === "forbidden" ? 403 : 409;
    return NextResponse.json({ error: access.message, reason: access.reason }, { status });
  }

  const { detail, isHost, booking } = access;
  const session = detail.session;
  const provider = getLiveProvider();
  const roomName = roomNameForSession(session.id);

  await provider.ensureRoom(roomName, { maxParticipants: session.capacity + 8 });

  const grant = await provider.issueToken(roomName, {
    identity: user.id,
    name: user.name,
    isHost,
  });

  if (isHost) {
    await db
      .update(classSessions)
      .set({
        roomProvider: provider.name,
        roomName,
        status:
          session.status === SessionStatus.SCHEDULED ? SessionStatus.LIVE : session.status,
        liveStartedAt: session.liveStartedAt ?? new Date(),
      })
      .where(eq(classSessions.id, session.id));
  } else if (booking) {
    await db
      .update(bookings)
      .set({
        joinedAt: booking.joinedAt ?? new Date(),
        attendance: Attendance.ATTENDED,
      })
      .where(eq(bookings.id, booking.id));
  }

  return NextResponse.json({
    grant,
    isHost,
    viewerName: user.name,
    session: {
      id: session.id,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      isRecording: session.isRecording,
    },
    instructorName: detail.instructorName,
  });
}
