"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Logo } from "./logo";

/** Long enough to read as a launch, short enough not to be a toll booth. */
const HOLD_MS = 850;
const FADE_MS = 340;

const SEEN_KEY = "personalise:splash-seen";

/**
 * Decided once per page load and then cached, because `getSnapshot` has to
 * return the same value every time it is called or React re-renders forever
 * — and this answer flips the moment `markSeen()` runs.
 */
let decision: boolean | null = null;

function shouldShow(): boolean {
  if (decision !== null) return decision;
  try {
    decision = sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    // Storage throws outright in some privacy modes. A splash that repeats is
    // a far smaller problem than a page that fails to render, so show it.
    decision = true;
  }
  return decision;
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to do; it will show again next load.
  }
}

/** Nothing external ever changes this, so the subscription is a no-op. */
const subscribe = () => () => {};

/**
 * The launch screen.
 *
 * Shown for the first load of a browser session and then not again until the
 * tab is closed — an installed PWA gets it on every launch, which is the case
 * it exists for, while someone reading three pages on the website sees it once.
 *
 * `useSyncExternalStore` rather than the usual "mounted" flag: the server must
 * render nothing (so the real page is what a crawler receives and what paints
 * first) while the client renders the overlay, and this is the hook built to
 * bridge exactly that gap without a hydration mismatch and without a
 * setState cascade on mount.
 *
 * The overlay is `aria-hidden` and never traps focus. A screen-reader user is
 * already being read the page underneath, and holding them at a decorative
 * brand card for the best part of a second would be an obstacle, not an
 * introduction.
 */
export function SplashScreen() {
  const show = useSyncExternalStore(subscribe, shouldShow, () => false);
  const [phase, setPhase] = useState<"showing" | "leaving" | "gone">("showing");

  useEffect(() => {
    if (!show) return;
    markSeen();
    // Dismissal is driven by timers, never by animationend — a browser that
    // skips the animation (reduced motion, a backgrounded tab) would otherwise
    // leave the splash on screen forever.
    const leave = setTimeout(() => setPhase("leaving"), HOLD_MS);
    const done = setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [show]);

  if (!show || phase === "gone") return null;

  return (
    <div
      aria-hidden="true"
      // pointer-events-none while leaving so a tap during the fade lands on
      // whatever the person was actually aiming at underneath.
      className={`fixed inset-0 z-[100] grid place-items-center bg-brand-700 ${
        phase === "leaving" ? "animate-splash-out pointer-events-none" : ""
      }`}
    >
      <div className="animate-splash-mark flex flex-col items-center gap-3">
        <Logo tone="light" className="scale-125" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-white/70"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
