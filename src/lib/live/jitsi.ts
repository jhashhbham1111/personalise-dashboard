import { createHmac } from "crypto";

import { env } from "../env";
import type { LiveGrant, LiveProvider, RoomIdentity } from "./provider";

/**
 * Jitsi Meet (meet.jit.si) live classes — the free option.
 *
 * meet.jit.si is a public server: no account, no API keys, no per-minute
 * cost, and no server-side room-management API — unlike LiveKit there's
 * nothing here to call to create a room, force-end one, or record. Rooms are
 * created implicitly the moment the first participant joins, and Jitsi tears
 * them down on its own once everyone leaves.
 *
 * The important consequence of "public server, no keys": there is no bearer
 * token gating who can open a room. Anyone who knows a room's name can go to
 * https://meet.jit.si/<room> directly and join it — this app's own
 * booking/host check (`getLiveAccess`) only runs when someone goes through
 * `/api/live/token`. So the entire safety of this mode rests on the Jitsi
 * room name being unguessable. `roomFor` below never uses the session id (or
 * anything derived from it in an obvious way) as the room name — it's an
 * HMAC of the app's own AUTH_SECRET, so nobody can construct or brute-force
 * a class's room name without that secret. Sharing the *app's* join link is
 * fine (it's access-checked); sharing the raw Jitsi URL that comes out of it
 * is not, and that's an inherent limitation of the free public server, not a
 * bug — a self-hosted Jitsi with JWT auth doesn't have it.
 *
 * Recording and per-participant server-side moderation (force-mute, kick)
 * aren't available without a JaaS account or self-hosting either. Moderation
 * still works, just client-side: on a Jitsi room with no lobby/JWT, whoever
 * joins first becomes the moderator and gets Jitsi's own built-in
 * mute/kick controls in its UI (see src/components/live/jitsi-room-view.tsx).
 * In practice that's the instructor, since they're the one who opens the
 * room to start class.
 */
function roomFor(roomName: string): string {
  const digest = createHmac("sha256", env.authSecret).update(roomName).digest("hex");
  return `personalise-${digest.slice(0, 24)}`;
}

export const jitsiLiveProvider: LiveProvider = {
  name: "jitsi",

  async ensureRoom() {
    /* Nothing to provision — see file comment. */
  },

  async issueToken(roomName: string, who: RoomIdentity): Promise<LiveGrant> {
    return {
      provider: "jitsi",
      roomName: roomFor(roomName),
      // No bearer credential on the free public server — access control is
      // the room name's obscurity (see file comment), not a token.
      token: "",
      serverUrl: env.jitsi.domain,
      identity: who.identity,
      isHost: who.isHost,
    };
  },

  async endRoom() {
    /* No server-side API on the free tier. `/api/live/end` already marks
       the session COMPLETED and resolves attendance regardless of provider
       — that's what actually matters app-side. */
  },

  async startRecording(): Promise<never> {
    throw new Error(
      "Recording isn't available on the free Jitsi option — it needs a JaaS account or a self-hosted server.",
    );
  },

  async stopRecording(): Promise<never> {
    throw new Error(
      "Recording isn't available on the free Jitsi option — it needs a JaaS account or a self-hosted server.",
    );
  },

  async muteParticipant() {
    /* Handled client-side by Jitsi's own moderator UI — see file comment. */
  },

  async removeParticipant() {
    /* Same as above. */
  },
};
