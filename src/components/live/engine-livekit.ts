import type { LiveGrant } from "@/lib/live/provider";
import type {
  LiveChatMessage,
  LiveEngineController,
  LiveParticipant,
  LiveRoomState,
} from "./types";

type DataMessage = { type: "chat"; body: string; name: string } | { type: "hand"; raised: boolean };

/**
 * The LiveKit-backed engine. Same `LiveEngineController` surface as the mock
 * engine, so `room.tsx` doesn't know or care which one it's driving.
 *
 * `livekit-client` is imported dynamically so a deployment that only ever
 * uses the mock provider never pays for it in the client bundle — mirroring
 * how the server-side LiveKit SDK is lazy-loaded in `src/lib/live/livekit.ts`.
 *
 * Host moderation (mute-another-participant, remove) isn't done directly
 * against the room here — the client SDK can't do that even with a host
 * token, since it's a privileged server operation. Those go through
 * `/api/live/moderate`, authenticated as this app rather than the browser.
 */
export async function createLiveKitEngine(opts: {
  grant: LiveGrant;
  sessionId: string;
  onUpdate: (state: LiveRoomState) => void;
}): Promise<LiveEngineController> {
  const LK = await import("livekit-client");
  const { Room, RoomEvent, Track } = LK;

  const room = new Room({ adaptiveStream: true, dynacast: true });
  const videoEls = new Map<string, HTMLVideoElement>();
  const handRaised = new Set<string>();
  const chat: LiveChatMessage[] = [];
  let status: LiveRoomState["status"] = "connecting";
  let errorMessage: string | undefined;
  let recording = false;
  let disposed = false;

  function rid(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  function emit() {
    if (disposed) return;
    opts.onUpdate({
      status,
      error: errorMessage,
      participants: collectParticipants(),
      chat: [...chat],
      isRecording: recording,
    });
  }

  function pushSystem(body: string) {
    chat.push({ id: rid(), kind: "system", from: "", name: "", body, at: Date.now() });
    emit();
  }

  function isHostAttr(attrs: Record<string, string> | undefined): boolean {
    return attrs?.isHost === "1";
  }

  function activeVideoTrack(p: InstanceType<typeof LK.Participant>) {
    const pubs = Array.from(p.videoTrackPublications.values());
    const screen = pubs.find((pub) => pub.source === Track.Source.ScreenShare && pub.track);
    const cam = pubs.find((pub) => pub.source === Track.Source.Camera && pub.track);
    return screen?.track ?? cam?.track ?? null;
  }

  function toParticipant(p: InstanceType<typeof LK.Participant>, isLocal: boolean): LiveParticipant {
    const pubs = Array.from(p.videoTrackPublications.values());
    const screen = pubs.some((pub) => pub.source === Track.Source.ScreenShare && pub.track);
    return {
      identity: p.identity,
      name: p.name || p.identity,
      isHost: isHostAttr(p.attributes),
      isLocal,
      micOn: p.isMicrophoneEnabled,
      camOn: p.isCameraEnabled,
      isScreenSharing: screen,
      handRaised: handRaised.has(p.identity),
      speaking: p.isSpeaking,
      hasVideo: !!activeVideoTrack(p),
    };
  }

  function collectParticipants(): LiveParticipant[] {
    const list = [toParticipant(room.localParticipant, true)];
    room.remoteParticipants.forEach((p) => list.push(toParticipant(p, false)));
    return list;
  }

  function syncVideo(identity: string) {
    const el = videoEls.get(identity);
    if (!el) return;
    const p =
      identity === room.localParticipant.identity
        ? room.localParticipant
        : room.remoteParticipants.get(identity);
    const track = p ? activeVideoTrack(p) : null;
    if (track) track.attach(el);
    else el.srcObject = null;
  }

  function syncAll() {
    videoEls.forEach((_el, identity) => syncVideo(identity));
    emit();
  }

  function sendData(msg: DataMessage) {
    const bytes = new TextEncoder().encode(JSON.stringify(msg));
    room.localParticipant.publishData(bytes, { reliable: true }).catch(() => undefined);
  }

  room.on(RoomEvent.ParticipantConnected, (p) => {
    pushSystem(`${p.name || p.identity} joined the class.`);
    syncAll();
  });
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    handRaised.delete(p.identity);
    pushSystem(`${p.name || p.identity} left the class.`);
    syncAll();
  });
  room.on(RoomEvent.TrackSubscribed, () => syncAll());
  room.on(RoomEvent.TrackUnsubscribed, () => syncAll());
  room.on(RoomEvent.TrackMuted, () => syncAll());
  room.on(RoomEvent.TrackUnmuted, () => syncAll());
  room.on(RoomEvent.ActiveSpeakersChanged, () => emit());
  room.on(RoomEvent.LocalTrackPublished, () => syncAll());
  room.on(RoomEvent.LocalTrackUnpublished, () => syncAll());
  room.on(RoomEvent.Disconnected, () => {
    status = "ended";
    emit();
  });
  room.on(RoomEvent.DataReceived, (payload, participant) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload)) as DataMessage;
      if (msg.type === "chat") {
        chat.push({
          id: rid(),
          kind: "chat",
          from: participant?.identity ?? "",
          name: msg.name || participant?.name || "Someone",
          body: msg.body,
          at: Date.now(),
        });
        emit();
      } else if (msg.type === "hand" && participant) {
        if (msg.raised) handRaised.add(participant.identity);
        else handRaised.delete(participant.identity);
        pushSystem(
          msg.raised
            ? `${participant.name || participant.identity} raised a hand.`
            : `${participant.name || participant.identity} lowered their hand.`,
        );
      }
    } catch {
      /* Ignore malformed data packets from a mismatched client version. */
    }
  });

  const controller: LiveEngineController = {
    toggleMic() {
      const enabled = !room.localParticipant.isMicrophoneEnabled;
      room.localParticipant.setMicrophoneEnabled(enabled).then(syncAll).catch(() => undefined);
    },
    toggleCamera() {
      const enabled = !room.localParticipant.isCameraEnabled;
      room.localParticipant.setCameraEnabled(enabled).then(syncAll).catch(() => undefined);
    },
    toggleScreenShare() {
      const pubs = Array.from(room.localParticipant.videoTrackPublications.values());
      const sharing = pubs.some((p) => p.source === Track.Source.ScreenShare);
      room.localParticipant
        .setScreenShareEnabled(!sharing)
        .then(syncAll)
        .catch(() => undefined);
    },
    sendChat(body) {
      const trimmed = body.trim();
      if (!trimmed) return;
      chat.push({
        id: rid(),
        kind: "chat",
        from: room.localParticipant.identity,
        name: room.localParticipant.name || "You",
        body: trimmed,
        at: Date.now(),
      });
      emit();
      sendData({ type: "chat", body: trimmed, name: room.localParticipant.name || "" });
    },
    toggleHandRaise() {
      const identity = room.localParticipant.identity;
      const next = !handRaised.has(identity);
      if (next) handRaised.add(identity);
      else handRaised.delete(identity);
      sendData({ type: "hand", raised: next });
      pushSystem(
        next
          ? `${room.localParticipant.name || "You"} raised a hand.`
          : `${room.localParticipant.name || "You"} lowered their hand.`,
      );
    },
    async muteParticipant(identity) {
      await fetch("/api/live/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId, action: "mute", targetIdentity: identity }),
      }).catch(() => undefined);
    },
    async removeParticipant(identity) {
      await fetch("/api/live/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId, action: "remove", targetIdentity: identity }),
      }).catch(() => undefined);
    },
    async muteAll() {
      const identities = Array.from(room.remoteParticipants.keys());
      await fetch("/api/live/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: opts.sessionId,
          action: "mute-all",
          participantIdentities: identities,
        }),
      }).catch(() => undefined);
    },
    async startRecording() {
      recording = true;
      emit();
      await fetch("/api/live/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId, action: "start" }),
      }).catch(() => undefined);
      pushSystem("Recording started.");
    },
    async stopRecording() {
      recording = false;
      emit();
      await fetch("/api/live/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId, action: "stop" }),
      }).catch(() => undefined);
      pushSystem("Recording saved — it'll show up in your media library.");
    },
    async endClass() {
      status = "ended";
      emit();
      await fetch("/api/live/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId }),
      }).catch(() => undefined);
      controller.dispose();
    },
    leave() {
      controller.dispose();
    },
    attachVideo(identity, el) {
      if (el) videoEls.set(identity, el);
      else videoEls.delete(identity);
      syncVideo(identity);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      room.disconnect().catch(() => undefined);
    },
  };

  try {
    await room.connect(opts.grant.serverUrl ?? "", opts.grant.token);
    await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
    await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
    status = "connected";
    pushSystem(`${room.localParticipant.name || "You"} joined the class.`);
    syncAll();
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : "Couldn't connect to the room.";
    emit();
  }

  return controller;
}
