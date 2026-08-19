import { env } from "../env";
import type { LiveGrant, LiveProvider, RoomIdentity } from "./provider";

/**
 * LiveKit-backed live classes.
 *
 * Enable with LIVE_PROVIDER=livekit plus LIVEKIT_URL / LIVEKIT_API_KEY /
 * LIVEKIT_API_SECRET. Works with LiveKit Cloud or a self-hosted server — the
 * only difference is the URL.
 *
 * The server SDK is imported lazily so the mock path never pays for it and the
 * app still boots when the package's native-ish deps aren't warm.
 */

type Egress = { egressId: string; fileUrl?: string | null };

async function sdk() {
  const mod = await import("livekit-server-sdk");
  return mod;
}

function requireConfig() {
  const { url, apiKey, apiSecret } = env.livekit;
  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      "LIVE_PROVIDER=livekit requires LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET",
    );
  }
  return { url, apiKey, apiSecret };
}

async function roomService() {
  const { url, apiKey, apiSecret } = requireConfig();
  const { RoomServiceClient } = await sdk();
  // The REST API lives on https, the client SDK connects over wss.
  const httpUrl = url.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, apiKey, apiSecret);
}

export const livekitProvider: LiveProvider = {
  name: "livekit",

  async ensureRoom(roomName, opts) {
    const svc = await roomService();
    try {
      await svc.createRoom({
        name: roomName,
        emptyTimeout: 15 * 60,
        maxParticipants: opts?.maxParticipants,
      });
    } catch {
      // Already exists — createRoom is not idempotent on every server version.
    }
  },

  async issueToken(roomName, who: RoomIdentity): Promise<LiveGrant> {
    const { url, apiKey, apiSecret } = requireConfig();
    const { AccessToken } = await sdk();

    const at = new AccessToken(apiKey, apiSecret, {
      identity: who.identity,
      name: who.name,
      ttl: "4h",
      // Lets the room UI (and server-side moderation) tell hosts from
      // participants without a separate lookup.
      attributes: { isHost: who.isHost ? "1" : "0" },
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Only the instructor may mute or remove other participants.
      roomAdmin: who.isHost,
      roomRecord: who.isHost,
    });

    return {
      provider: "livekit",
      roomName,
      token: await at.toJwt(),
      serverUrl: url,
      identity: who.identity,
      isHost: who.isHost,
    };
  },

  async endRoom(roomName) {
    const svc = await roomService();
    await svc.deleteRoom(roomName);
  },

  async startRecording(roomName) {
    const { url, apiKey, apiSecret } = requireConfig();
    const { EgressClient, EncodedFileType, EncodedFileOutput } = await sdk();
    const client = new EgressClient(url.replace(/^ws/, "http"), apiKey, apiSecret);

    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `recordings/${roomName}-{time}.mp4`,
    });

    const info = (await client.startRoomCompositeEgress(roomName, {
      file: output,
    })) as unknown as Egress;

    return { recordingId: info.egressId };
  },

  async stopRecording(_roomName, recordingId) {
    void _roomName;
    const { url, apiKey, apiSecret } = requireConfig();
    const { EgressClient } = await sdk();
    const client = new EgressClient(url.replace(/^ws/, "http"), apiKey, apiSecret);
    const info = (await client.stopEgress(recordingId)) as unknown as Egress;
    return { url: info.fileUrl ?? null };
  },

  async muteParticipant(roomName, identity) {
    const svc = await roomService();
    // There's no single "mute" RPC on the server API — revoking publish
    // permission has the same effect and doesn't require knowing the
    // participant's current track SIDs.
    await svc.updateParticipant(roomName, identity, {
      permission: { canPublish: false, canSubscribe: true, canPublishData: true },
    });
  },

  async removeParticipant(roomName, identity) {
    const svc = await roomService();
    await svc.removeParticipant(roomName, identity);
  },
};
