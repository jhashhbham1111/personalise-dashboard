import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { classSessions, db, videoAssets } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { Visibility, VideoType } from "@/lib/enums";
import { getLiveProvider, roomNameForSession } from "@/lib/live";
import { getLiveAccess } from "@/lib/live/access";

type RecordingBody = { sessionId?: string; action?: "start" | "stop" };

/**
 * Host-only. Starting hands back nothing interesting; stopping is where a
 * `VideoAsset` gets created so the recording shows up in the class's media
 * library the moment egress finishes — no separate "publish" step.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: RecordingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const { sessionId, action } = body;
  if (!sessionId || !action) {
    return NextResponse.json({ error: "Missing sessionId or action." }, { status: 400 });
  }

  const access = await getLiveAccess(sessionId, user);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.reason === "not-found" ? 404 : 409 },
    );
  }
  if (!access.isHost) {
    return NextResponse.json({ error: "Only the host can record." }, { status: 403 });
  }

  const provider = getLiveProvider();
  const roomName = roomNameForSession(sessionId);
  const session = access.detail.session;

  if (action === "start") {
    if (session.isRecording) {
      return NextResponse.json({ ok: true, alreadyRecording: true });
    }
    const { recordingId } = await provider.startRecording(roomName);
    await db
      .update(classSessions)
      .set({ isRecording: true, recordingId })
      .where(eq(classSessions.id, sessionId));
    return NextResponse.json({ ok: true });
  }

  // action === "stop"
  if (!session.isRecording || !session.recordingId) {
    return NextResponse.json({ ok: true, wasRecording: false });
  }

  const { url } = await provider.stopRecording(roomName, session.recordingId);
  await db
    .update(classSessions)
    .set({ isRecording: false })
    .where(eq(classSessions.id, sessionId));

  if (url) {
    await db.insert(videoAssets).values({
      instructorId: session.instructorId,
      offeringId: session.offeringId,
      sessionId: session.id,
      title: `${access.detail.offering.title} — recorded ${new Date().toLocaleDateString("en-IN")}`,
      type: VideoType.SESSION_RECORDING,
      url,
      visibility: Visibility.ENROLLED_ONLY,
      publishedAt: new Date(),
    });
  }

  return NextResponse.json({ ok: true, url: url ?? null });
}
