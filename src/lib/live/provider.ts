/**
 * Live video provider abstraction.
 *
 * The class room UI (src/components/live/*) talks to a *client* engine; this is
 * the *server* half — creating rooms and minting scoped access tokens. Both the
 * mock and LiveKit implementations satisfy the same contract, so the room UI is
 * identical whether or not you have a LiveKit account.
 */

export type RoomIdentity = {
  /** Stable per-user identity inside the room. */
  identity: string;
  name: string;
  /** Hosts can mute others, remove participants, record, and end the class. */
  isHost: boolean;
};

export type LiveGrant = {
  provider: "mock" | "livekit";
  roomName: string;
  token: string;
  /** WebSocket URL for the media server. Null for the mock provider. */
  serverUrl: string | null;
  identity: string;
  isHost: boolean;
};

export interface LiveProvider {
  readonly name: "mock" | "livekit";
  /** Idempotent — returns the existing room if it already exists. */
  ensureRoom(roomName: string, opts?: { maxParticipants?: number }): Promise<void>;
  issueToken(roomName: string, who: RoomIdentity): Promise<LiveGrant>;
  endRoom(roomName: string): Promise<void>;
  startRecording(roomName: string): Promise<{ recordingId: string }>;
  stopRecording(
    roomName: string,
    recordingId: string,
  ): Promise<{ url: string | null }>;
  /** Host-only moderation. Revokes the participant's ability to publish audio/video. */
  muteParticipant(roomName: string, identity: string): Promise<void>;
  /** Host-only moderation. Disconnects the participant; they may rejoin. */
  removeParticipant(roomName: string, identity: string): Promise<void>;
}

/** Deterministic room name so re-joining a class always lands in the same room. */
export function roomNameForSession(sessionId: string): string {
  return `class-${sessionId}`;
}

export {
  isWithinJoinWindow,
  JOIN_WINDOW_AFTER_MIN,
  JOIN_WINDOW_BEFORE_MIN,
} from "../booking-policy";
