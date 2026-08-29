import type {
  LiveChatMessage,
  LiveEngineController,
  LiveParticipant,
  LiveRoomState,
  SimPeer,
} from "./types";

/**
 * The mock live engine.
 *
 * No media server: your real camera and mic go straight into a `<video>`
 * tile, and one or two simulated peers (built from the class's actual
 * roster — the other names in this room, not fake ones) join on a short
 * delay with an animated placeholder feed. Every control — mute, camera,
 * screen share, hand raise, host mute/remove, recording — does something
 * real, so the room behaves the same way it would against LiveKit; it just
 * isn't talking to anyone else's browser.
 */
export function createMockEngine(opts: {
  identity: string;
  name: string;
  isHost: boolean;
  sessionId: string;
  peers: SimPeer[];
  onUpdate: (state: LiveRoomState) => void;
}): LiveEngineController {
  let disposed = false;
  let localStream: MediaStream | null = null;
  let screenStream: MediaStream | null = null;
  let sharingScreen = false;
  let audioCtx: AudioContext | null = null;
  let speakingTimer: number | null = null;

  const videoEls = new Map<string, HTMLVideoElement>();
  const fakeStreams = new Map<string, MediaStream>();
  const fakeAnimHandles = new Map<string, number>();
  const participants = new Map<string, LiveParticipant>();
  const chat: LiveChatMessage[] = [];

  let status: LiveRoomState["status"] = "connecting";
  let errorMessage: string | undefined;
  let recording = false;

  participants.set(opts.identity, {
    identity: opts.identity,
    name: opts.name,
    isHost: opts.isHost,
    isLocal: true,
    micOn: true,
    camOn: true,
    isScreenSharing: false,
    handRaised: false,
    speaking: false,
    hasVideo: false,
  });

  function rid(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  function emit() {
    if (disposed) return;
    opts.onUpdate({
      status,
      error: errorMessage,
      participants: Array.from(participants.values()),
      chat: [...chat],
      isRecording: recording,
    });
  }

  function pushSystem(body: string) {
    chat.push({ id: rid(), kind: "system", from: "", name: "", body, at: Date.now() });
    emit();
  }

  function activeLocalStream(): MediaStream | null {
    return sharingScreen ? screenStream : localStream;
  }

  function syncVideo(identity: string) {
    const el = videoEls.get(identity);
    if (!el) return;
    const stream = identity === opts.identity ? activeLocalStream() : fakeStreams.get(identity) ?? null;
    if (el.srcObject !== stream) el.srcObject = stream;
  }

  function createFakeVideoStream(label: string): MediaStream {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    let hue = Math.floor(Math.random() * 360);
    const draw = () => {
      if (disposed) return;
      hue = (hue + 0.35) % 360;
      const g = ctx.createLinearGradient(0, 0, 320, 240);
      g.addColorStop(0, `hsl(${hue}, 50%, 32%)`);
      g.addColorStop(1, `hsl(${(hue + 70) % 360}, 50%, 18%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, 160, 128);
      fakeAnimHandles.set(label, requestAnimationFrame(draw));
    };
    draw();
    return canvas.captureStream(12);
  }

  function watchLocalSpeaking() {
    if (!localStream || localStream.getAudioTracks().length === 0) return;
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(localStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;
      speakingTimer = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const local = participants.get(opts.identity);
        if (!local || !local.micOn) {
          if (wasSpeaking) {
            wasSpeaking = false;
            if (local) local.speaking = false;
            emit();
          }
          return;
        }
        const isSpeaking = avg > 18;
        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          local.speaking = isSpeaking;
          emit();
        }
      }, 350);
    } catch {
      /* Web Audio unavailable — speaking indicator just stays off. */
    }
  }

  async function start() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      watchLocalSpeaking();
    } catch {
      // Camera/mic denied or unavailable — the room still works as an avatar tile.
    }
    const local = participants.get(opts.identity)!;
    local.camOn = !!localStream?.getVideoTracks().length;
    local.micOn = !!localStream?.getAudioTracks().length;
    local.hasVideo = local.camOn;
    syncVideo(opts.identity);
    status = "connected";
    emit();
    pushSystem(`${opts.name} joined the class.`);

    opts.peers.forEach((peer, i) => {
      window.setTimeout(() => {
        if (disposed) return;
        const stream = createFakeVideoStream(peer.name);
        fakeStreams.set(peer.identity, stream);
        participants.set(peer.identity, {
          identity: peer.identity,
          name: peer.name,
          isHost: peer.isHost,
          isLocal: false,
          micOn: true,
          camOn: true,
          isScreenSharing: false,
          handRaised: false,
          speaking: false,
          hasVideo: true,
        });
        syncVideo(peer.identity);
        pushSystem(`${peer.name} joined the class.`);
      }, 900 + i * 1400);
    });
  }

  function stopFake(identity: string) {
    fakeStreams.get(identity)?.getTracks().forEach((t) => t.stop());
    fakeStreams.delete(identity);
    const handle = fakeAnimHandles.get(identity);
    if (handle) cancelAnimationFrame(handle);
    fakeAnimHandles.delete(identity);
  }

  const controller: LiveEngineController = {
    toggleMic() {
      if (!localStream) return;
      const local = participants.get(opts.identity)!;
      local.micOn = !local.micOn;
      localStream.getAudioTracks().forEach((t) => (t.enabled = local.micOn));
      emit();
    },
    toggleCamera() {
      if (!localStream) return;
      const local = participants.get(opts.identity)!;
      local.camOn = !local.camOn;
      local.hasVideo = local.camOn && !sharingScreen;
      localStream.getVideoTracks().forEach((t) => (t.enabled = local.camOn));
      emit();
    },
    async toggleScreenShare() {
      const local = participants.get(opts.identity)!;
      if (sharingScreen) {
        screenStream?.getTracks().forEach((t) => t.stop());
        screenStream = null;
        sharingScreen = false;
        local.isScreenSharing = false;
        local.hasVideo = local.camOn;
        syncVideo(opts.identity);
        emit();
        return;
      }
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        sharingScreen = true;
        local.isScreenSharing = true;
        local.hasVideo = true;
        syncVideo(opts.identity);
        const [track] = screenStream.getVideoTracks();
        track?.addEventListener("ended", () => {
          sharingScreen = false;
          screenStream = null;
          local.isScreenSharing = false;
          local.hasVideo = local.camOn;
          syncVideo(opts.identity);
          emit();
        });
        emit();
      } catch {
        /* User cancelled the picker. */
      }
    },
    sendChat(body) {
      const trimmed = body.trim();
      if (!trimmed) return;
      chat.push({ id: rid(), kind: "chat", from: opts.identity, name: opts.name, body: trimmed, at: Date.now() });
      emit();
    },
    toggleHandRaise() {
      const local = participants.get(opts.identity)!;
      local.handRaised = !local.handRaised;
      pushSystem(
        local.handRaised ? `${opts.name} raised a hand.` : `${opts.name} lowered their hand.`,
      );
    },
    muteParticipant(identity) {
      const p = participants.get(identity);
      if (!p || p.isLocal) return;
      p.micOn = false;
      pushSystem(`${p.name} was muted by the host.`);
    },
    removeParticipant(identity) {
      const p = participants.get(identity);
      if (!p || p.isLocal) return;
      participants.delete(identity);
      stopFake(identity);
      pushSystem(`${p.name} was removed from the class.`);
    },
    muteAll() {
      let any = false;
      for (const p of participants.values()) {
        if (!p.isLocal && p.micOn) {
          p.micOn = false;
          any = true;
        }
      }
      if (any) pushSystem("The host muted everyone.");
      else emit();
    },
    async startRecording() {
      recording = true;
      emit();
      pushSystem("Recording started.");
      await fetch("/api/live/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: opts.sessionId, action: "start" }),
      }).catch(() => undefined);
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
    startAudio() { /* mock — audio is never blocked in dev */ },
    attachVideo(identity, el) {
      if (el) videoEls.set(identity, el);
      else videoEls.delete(identity);
      syncVideo(identity);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      localStream?.getTracks().forEach((t) => t.stop());
      screenStream?.getTracks().forEach((t) => t.stop());
      fakeStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      fakeAnimHandles.forEach((h) => cancelAnimationFrame(h));
      if (speakingTimer) window.clearInterval(speakingTimer);
      audioCtx?.close().catch(() => undefined);
    },
  };

  void errorMessage;
  void start();
  return controller;
}
