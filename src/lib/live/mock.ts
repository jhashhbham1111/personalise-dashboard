import { randomUUID } from "crypto";
import { SignJWT } from "jose";

import { env } from "../env";
import type { LiveGrant, LiveProvider, RoomIdentity } from "./provider";

const secretKey = new TextEncoder().encode(env.authSecret);

/**
 * Development live provider.
 *
 * No media server: it mints a signed grant describing who you are in the room,
 * and the client-side mock engine (src/lib/live/engine-mock.ts) renders your real
 * camera plus simulated peers. Every control in the room UI — mute, camera,
 * screen share, hand raise, host mute-all, recording, end class — is wired the
 * same way it is against LiveKit, so nothing about the UI changes when you
 * switch providers.
 */
export const mockLiveProvider: LiveProvider = {
  name: "mock",

  async ensureRoom() {
    /* Nothing to provision. */
  },

  async issueToken(roomName: string, who: RoomIdentity): Promise<LiveGrant> {
    const token = await new SignJWT({
      room: roomName,
      identity: who.identity,
      name: who.name,
      isHost: who.isHost,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .sign(secretKey);

    return {
      provider: "mock",
      roomName,
      token,
      serverUrl: null,
      identity: who.identity,
      isHost: who.isHost,
    };
  },

  async endRoom() {
    /* Nothing to tear down. */
  },

  async startRecording() {
    return { recordingId: `rec_mock_${randomUUID().slice(0, 8)}` };
  },

  async stopRecording() {
    // A real egress would upload to storage and hand back a URL. In mock mode we
    // return a sample so the recording still shows up in the class library.
    return {
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    };
  },

  async muteParticipant() {
    // The mock room has no real server-tracked participants — the client-side
    // mock engine mutes its simulated peers locally instead.
  },

  async removeParticipant() {
    /* Same as above — nothing to do server-side. */
  },
};
