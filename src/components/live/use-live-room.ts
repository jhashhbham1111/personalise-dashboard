"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { LiveEngineController, LiveRoomState, SimPeer } from "./types";

type LiveGrant = {
  provider: "mock" | "livekit" | "jitsi";
  roomName: string;
  token: string;
  serverUrl: string | null;
  identity: string;
  isHost: boolean;
};

type TokenResponse = {
  grant: LiveGrant;
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

/** Capability, not state: nothing ever changes it, so nothing to subscribe to. */
const neverChanges = () => () => {};
const hasGetDisplayMedia = () =>
  typeof navigator.mediaDevices?.getDisplayMedia === "function";
const noScreenShareOnServer = () => false;

/**
 * Whether this browser can capture a screen at all.
 *
 * Chrome and Safari on Android/iOS ship `navigator.mediaDevices` but simply
 * don't implement `getDisplayMedia`, so a "Share screen" button there is a
 * button that can only fail. Feature-detecting beats sniffing the user agent:
 * the same check also covers WebViews, the Play Store TWA wrapper, and any
 * future browser that drops the API — none of which a UA string would tell us
 * reliably.
 *
 * `useSyncExternalStore` rather than a `useEffect` that sets state: it takes a
 * separate server snapshot, so the markup React renders on the server and
 * hydrates on the client agree by construction (always "no screen share"), and
 * the real answer lands in the same commit as hydration rather than a render
 * later.
 */
export function useScreenShareSupport(): boolean {
  return useSyncExternalStore(
    neverChanges,
    hasGetDisplayMedia,
    noScreenShareOnServer,
  );
}

/**
 * Fetches a join grant for the session and boots whichever engine the grant
 * says to use. One hook, one code path — `room.tsx` never has to know which
 * provider is live.
 */
export function useLiveRoom(opts: { sessionId: string; peers: SimPeer[] }) {
  const [state, setState] = useState<LiveRoomState>(EMPTY_STATE);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [controller, setController] = useState<LiveEngineController | null>(null);
  // Jitsi has no `LiveEngineController` — it owns its own full meeting UI
  // (see jitsi-room-view.tsx) rather than driving room.tsx's video grid, so
  // it only needs the grant itself, not an engine.
  const [grant, setGrant] = useState<LiveGrant | null>(null);
  const [viewerName, setViewerName] = useState("");
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

      setGrant(data.grant);
      setViewerName(data.viewerName);

      if (data.grant.provider === "jitsi") {
        // The Jitsi embed connects itself, inside its own iframe — there's
        // no engine to boot here, just the grant for jitsi-room-view.tsx to
        // use directly.
        setState({ status: "connected", participants: [], chat: [], isRecording: false });
        return;
      }

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

  return { state, controller, tokenError, grant, viewerName };
}
