"use client";

import { useEffect, useRef, useState } from "react";

import type { LiveEngineController, LiveRoomState, SimPeer } from "./types";

type TokenResponse = {
  grant: {
    provider: "mock" | "livekit";
    roomName: string;
    token: string;
    serverUrl: string | null;
    identity: string;
    isHost: boolean;
  };
  isHost: boolean;
  viewerName: string;
  session: { id: string; title: string; startsAt: string; endsAt: string; isRecording: boolean };
  instructorName: string;
};

const EMPTY_STATE: LiveRoomState = {
  status: "connecting",
  participants: [],
  chat: [],
  isRecording: false,
};

/**
 * Fetches a join grant for the session and boots whichever engine the grant
 * says to use. One hook, one code path — `room.tsx` never has to know which
 * provider is live.
 */
export function useLiveRoom(opts: { sessionId: string; peers: SimPeer[] }) {
  const [state, setState] = useState<LiveRoomState>(EMPTY_STATE);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [controller, setController] = useState<LiveEngineController | null>(null);
  // Mirrors `controller` for the effect cleanup, which must never read state
  // set by a later, possibly-stale render.
  const controllerRef = useRef<LiveEngineController | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let data: TokenResponse;
      try {
        const res = await fetch("/api/live/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: opts.sessionId }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setTokenError(json.error ?? "Couldn't join this class.");
          return;
        }
        data = json as TokenResponse;
      } catch {
        if (!cancelled) setTokenError("Couldn't reach the server. Check your connection and try again.");
        return;
      }
      if (cancelled) return;

      const onUpdate = (s: LiveRoomState) => {
        if (!cancelled) setState(s);
      };

      let engine: LiveEngineController;
      if (data.grant.provider === "mock") {
        const { createMockEngine } = await import("./engine-mock");
        if (cancelled) return;
        engine = createMockEngine({
          identity: data.grant.identity,
          name: data.viewerName,
          isHost: data.isHost,
          sessionId: opts.sessionId,
          peers: opts.peers,
          onUpdate,
        });
      } else {
        const { createLiveKitEngine } = await import("./engine-livekit");
        if (cancelled) return;
        engine = await createLiveKitEngine({
          grant: data.grant,
          sessionId: opts.sessionId,
          onUpdate,
        });
      }
      if (cancelled) {
        engine.dispose();
        return;
      }
      controllerRef.current = engine;
      setController(engine);
    })();

    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.sessionId]);

  return { state, controller, tokenError };
}
