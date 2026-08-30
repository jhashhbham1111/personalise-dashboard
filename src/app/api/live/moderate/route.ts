import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getLiveProvider, roomNameForSession } from "@/lib/live";
import { getLiveAccess } from "@/lib/live/access";

type ModerateAction = "mute" | "remove" | "mute-all";

type ModerateBody = {
  sessionId?: string;
  action?: ModerateAction;
  targetIdentity?: string;
  /** For mute-all: the room's current non-host participant identities, as the
   *  client sees them. The mock provider has no server-side room roster to
   *  enumerate, so the caller supplies the list. */
  participantIdentities?: string[];
};

/**
 * Host-only room moderation: mute a participant, remove one, or mute
 * everyone at once. Kept as a server route (rather than something the client
 * engine does directly) because muting or removing *another* participant is
 * a privileged operation the LiveKit client SDK can't perform on its own —
 * it has to go through the server API, authenticated as this app, not as the
 * host's browser session.
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

  let body: ModerateBody;
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
    return NextResponse.json({ error: "Only the host can do that." }, { status: 403 });
  }

  const provider = getLiveProvider();
  const roomName = roomNameForSession(sessionId);

  if (action === "mute") {
    if (!body.targetIdentity) {
      return NextResponse.json({ error: "Missing targetIdentity." }, { status: 400 });
    }
    await provider.muteParticipant(roomName, body.targetIdentity);
  } else if (action === "remove") {
    if (!body.targetIdentity) {
      return NextResponse.json({ error: "Missing targetIdentity." }, { status: 400 });
    }
    await provider.removeParticipant(roomName, body.targetIdentity);
  } else if (action === "mute-all") {
    const targets = (body.participantIdentities ?? []).filter((id) => id !== user.id);
    for (const identity of targets) {
      await provider.muteParticipant(roomName, identity);
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
