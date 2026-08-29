"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneOff } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

/**
 * The Jitsi-backed room.
 *
 * Unlike the mock and LiveKit engines, this deliberately does NOT implement
 * `LiveEngineController` and doesn't render `room.tsx`'s participant grid.
 * Jitsi's iframe embed brings its own complete meeting UI — video tiles,
 * mute/camera, screen share, chat, raise hand, and a participant list with
 * moderator controls — so duplicating that with our own controls would just
 * mean two competing sets of buttons that can drift out of sync. We wrap it
 * with a thin bar of our own (title + host-only "End class") and let Jitsi's
 * iframe own everything else. See `src/lib/live/jitsi.ts` for why the room
 * name has to be treated as a secret rather than a real access-controlled
 * credential — that's the free public server's tradeoff, not a bug.
 */

type JitsiExternalApi = {
  addEventListener: (event: string, cb: (payload?: unknown) => void) => void;
  dispose: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>,
    ) => JitsiExternalApi;
  }
}

function loadJitsiScript(domain: string): Promise<void> {
  if (typeof window !== "undefined" && window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  const src = `https://${domain}/external_api.js`;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Couldn't load the video call.")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the video call."));
    document.head.appendChild(script);
  });
}

export function JitsiRoomView({
  sessionId,
  title,
  isHost,
  backHref,
  domain,
  roomName,
  viewerName,
}: {
  sessionId: string;
  title: string;
  isHost: boolean;
  backHref: string;
  domain: string;
  roomName: string;
  viewerName: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const leftRef = useRef(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function leaveOnce() {
      if (leftRef.current) return;
      leftRef.current = true;
      router.push(backHref);
    }

    loadJitsiScript(domain)
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: containerRef.current,
          userInfo: { displayName: viewerName },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            // Start in speaker view so the active speaker (instructor) is
            // featured large; students appear in the filmstrip.
            disableTileView: true,
            p2p: { enabled: false },
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'chat',
              'participants-pane', 'raisehand', 'fullscreen', 'hangup',
            ],
          },
        });
        apiRef.current = api;
        // Fired once it's safe to tear the iframe down — covers both a
        // normal hangup and being kicked by the moderator.
        api.addEventListener("readyToClose", leaveOnce);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Couldn't load the video call.");
        }
      });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, roomName]);

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-950 px-4 py-8 text-center text-white">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold">Couldn&apos;t load the video call</h1>
          <p className="mt-2 text-sm text-white/60">{loadError}</p>
          <ButtonLink href={backHref} className="mt-6 min-h-11" variant="secondary">
            Back
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-white">
      {/* `flex-wrap` only bites below `md`: on a 360px screen the title and the
          confirm-end row can't share a line, and without it the buttons get
          squeezed to a few pixels wide rather than dropping to their own row. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[calc(0.75rem_+_env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full bg-danger-600/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" />
            Live
          </span>
          <h1 className="truncate text-sm font-medium text-white/90 sm:text-base">{title}</h1>
        </div>

        {isHost ? (
          confirmEnd ? (
            <div className="flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-neutral-800 px-3 py-1.5 md:w-auto">
              <span className="text-xs text-white/80">End for everyone?</span>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex min-h-11 items-center rounded-full px-3 py-1 text-xs text-white/60 hover:bg-white/10 md:min-h-0 md:px-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/live/end", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId }),
                  }).catch(() => undefined);
                  leftRef.current = true;
                  apiRef.current?.dispose();
                  router.push(backHref);
                }}
                className="flex min-h-11 items-center rounded-full bg-danger-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-danger-700 md:min-h-0 md:px-2.5"
              >
                End class
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-danger-600/80 hover:text-white md:min-h-0"
            >
              <PhoneOff className="h-3.5 w-3.5" /> End class
            </button>
          )
        ) : null}
      </header>

      {/* Jitsi injects its iframe here and sizes it in percentages, so it needs a
          parent with a real resolved height — `flex-1` inside the `h-dvh` column
          gives it one, and the explicit child rule covers the case where Jitsi's
          own inline sizing doesn't stick. The safe-area padding keeps Jitsi's
          bottom toolbar clear of the phone's gesture bar; it is 0 elsewhere. */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom)] [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0"
      />
    </div>
  );
}
