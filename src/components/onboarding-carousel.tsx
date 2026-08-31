"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MonitorPlay, Search, Ticket } from "lucide-react";

import { Button, ButtonLink } from "./ui/button";
import { cn } from "@/lib/utils";

const SEEN_KEY = "personalise:onboarded";

/** Cached for the life of the page — see the same note in splash-screen.tsx. */
let decision: boolean | null = null;

function isUnseen(): boolean {
  if (decision !== null) return decision;
  try {
    decision = localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    // The opposite call to the splash screen: repeating a three-slide
    // introduction on every visit is a real obstacle, so when storage can't be
    // read, stay shut.
    decision = false;
  }
  return decision;
}

/** Nothing external ever changes this, so the subscription is a no-op. */
const subscribe = () => () => {};

/**
 * Three slides, because three is what someone will sit through. Each one is a
 * thing the app actually does end to end, in the order a student meets them —
 * not a feature list.
 */
const SLIDES = [
  {
    icon: Search,
    title: "Find someone who actually teaches",
    body: "Browse instructors by what they teach and where they are, and see a real schedule rather than a phone number to ask about one.",
  },
  {
    icon: Ticket,
    title: "Buy a pass, book your seat",
    body: "Drop in once, buy a pack, or go monthly. Your credits, bookings and receipts all sit in one place.",
  },
  {
    icon: MonitorPlay,
    title: "Join live, or turn up in person",
    body: "Online classes open right here in the app. In-person ones come with the address and directions.",
  },
] as const;

/**
 * First-run introduction, shown once ever and only to someone who is signed
 * out.
 *
 * Mounted from the landing page rather than the root layout: `/` is the page a
 * first-time visitor lands on, and putting it anywhere deeper would ambush
 * somebody who arrived on a class link with an introduction to an app they had
 * already started using.
 *
 * The landing page's own HTML is untouched, so this costs nothing for search
 * engines and shows nothing at all if the JavaScript never arrives.
 */
export function OnboardingCarousel() {
  // Server renders nothing; the client decides from storage. useSyncExternalStore
  // is what lets those two disagree without a hydration mismatch.
  const unseen = useSyncExternalStore(subscribe, isUnseen, () => false);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const open = unseen && !dismissed;

  // Nothing behind the dialog should scroll while it is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do — it will simply be offered again next visit.
    }
    decision = false;
    setDismissed(true);
  }

  if (!open) return null;

  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  function go(next: number) {
    setIndex(Math.min(SLIDES.length - 1, Math.max(0, next)));
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-end bg-ink/40 backdrop-blur-sm sm:place-items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        className="animate-sheet-up w-full rounded-t-2xl bg-surface p-6 outline-none sm:max-w-md sm:rounded-2xl"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          const end = e.changedTouches[0]?.clientX;
          touchStartX.current = null;
          if (start == null || end == null) return;
          // 48px so a slightly diagonal scroll doesn't count as a swipe.
          if (end - start > 48) go(index - 1);
          if (start - end > 48) go(index + 1);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Icon className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 rounded-lg px-2 py-1 text-sm font-medium text-ink-faint transition-colors hover:bg-paper hover:text-ink"
          >
            Skip
          </button>
        </div>

        {/* aria-live so a screen reader is told the slide changed — the dots
            alone are a purely visual cue. */}
        <div aria-live="polite">
          <h2
            id="onboarding-title"
            className="mt-4 text-xl font-semibold leading-tight text-ink"
          >
            {slide.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{slide.body}</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex gap-1.5" role="tablist" aria-label="Slides">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1} of ${SLIDES.length}`}
                onClick={() => go(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-brand-600" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>

          {last ? (
            <ButtonLink href="/signup" onClick={dismiss}>
              Get started
            </ButtonLink>
          ) : (
            <Button onClick={() => go(index + 1)}>Next</Button>
          )}
        </div>

        {/* Dismissing lands on the page that is already underneath — which
            lists instructors, classes and videos — so "look around" needs no
            navigation of its own. */}
        {last ? (
          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full rounded-lg py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper hover:text-brand-700"
          >
            Just let me look around
          </button>
        ) : null}
      </div>
    </div>
  );
}
