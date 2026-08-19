export type LiveParticipant = {
  identity: string;
  name: string;
  isHost: boolean;
  isLocal: boolean;
  micOn: boolean;
  camOn: boolean;
  isScreenSharing: boolean;
  handRaised: boolean;
  speaking: boolean;
  /** Whether there's a live video track to render — false falls back to the avatar tile. */
  hasVideo: boolean;
};

export type LiveChatMessage = {
  id: string;
  kind: "chat" | "system";
  from: string;
  name: string;
  body: string;
  at: number;
};

export type LiveRoomState = {
  status: "connecting" | "connected" | "ended" | "error";
  error?: string;
  participants: LiveParticipant[];
  chat: LiveChatMessage[];
  isRecording: boolean;
};

/**
 * What the room UI drives, regardless of which provider is behind it. The
 * mock and LiveKit engines each implement this the same way the server-side
 * `LiveProvider` interface keeps the two video backends interchangeable.
 */
export type LiveEngineController = {
  toggleMic(): void;
  toggleCamera(): void;
  toggleScreenShare(): void;
  sendChat(body: string): void;
  toggleHandRaise(): void;
  muteParticipant(identity: string): void;
  removeParticipant(identity: string): void;
  muteAll(): void;
  startRecording(): void;
  stopRecording(): void;
  endClass(): void;
  leave(): void;
  attachVideo(identity: string, el: HTMLVideoElement | null): void;
  dispose(): void;
};

export type SimPeer = { identity: string; name: string; isHost: boolean };
