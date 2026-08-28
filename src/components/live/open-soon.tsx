"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * The room opens 15 minutes before the class starts. Rather than a dead
 * "come back later" page, this counts down and reloads itself the moment
 * the window opens, so a student who arrives a bit early doesn't have to
 * remember to refresh.
 */
export function OpenSoon({ opensAtISO }: { opensAtISO: string }) {
  const router = useRouter();
  const opensAt = new Date(opensAtISO).getTime();
  // Lazy initializer: reads the clock on mount without setting state from
  // inside the effect body itself.
  const [now, setNow] = useState<number | null>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (now !== null && now >= opensAt) router.refresh();
  }, [now, opensAt, router]);

  const remaining = now === null ? null : opensAt - now;

  return (
    <div className="mt-4">
      {remaining !== null && remaining > 0 ? (
        <p className="text-2xl font-semibold tabular-nums text-ink">
          {formatCountdown(remaining)}
        </p>
      ) : null}
      <Button
        variant="secondary"
        className="mt-4 min-h-11 w-full sm:w-auto"
        onClick={() => router.refresh()}
      >
        Check again
      </Button>
    </div>
  );
}
