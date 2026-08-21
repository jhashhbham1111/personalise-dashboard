"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type CalendarSession = {
  id: string;
  title: string;
  /** ISO string — serialised because this crosses the server/client boundary. */
  startsAt: string;
  offeringId: string;
  status: string;
  booked: number;
  capacity: number;
  /** Local day key, yyyy-mm-dd, computed server-side in the viewer's timezone. */
  day: string;
  /** Local time label, e.g. "6:30 am". */
  time: string;
};

/**
 * A month grid rather than a list of days.
 *
 * The list version answered "what's next" but never "what does my week look
 * like" — an instructor planning their time needs to see shape and gaps, and a
 * vertical list of dates hides both. Classes are colour-coded per offering so a
 * repeating pattern is recognisable at a glance without reading any text.
 */

/** Fixed palette, assigned by offering, so a class keeps its colour month to month. */
const CHIP_COLOURS = [
  "bg-brand-100 text-brand-800 hover:bg-brand-200",
  "bg-amber-100 text-amber-900 hover:bg-amber-200",
  "bg-sky-100 text-sky-900 hover:bg-sky-200",
  "bg-violet-100 text-violet-900 hover:bg-violet-200",
  "bg-rose-100 text-rose-900 hover:bg-rose-200",
  "bg-emerald-100 text-emerald-900 hover:bg-emerald-200",
];

const DOT_COLOURS = [
  "bg-brand-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-emerald-500",
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ScheduleCalendar({
  sessions,
  /** yyyy-mm-dd of "today" in the viewer's timezone, from the server. */
  todayKey,
  offeringNames,
}: {
  sessions: CalendarSession[];
  todayKey: string;
  offeringNames: { id: string; title: string }[];
}) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [cursor, setCursor] = useState({ year: ty, month: tm - 1 });

  const colourFor = useMemo(() => {
    const map = new Map<string, number>();
    offeringNames.forEach((o, i) => map.set(o.id, i % CHIP_COLOURS.length));
    return (offeringId: string) => map.get(offeringId) ?? 0;
  }, [offeringNames]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const list = m.get(s.day) ?? [];
      list.push(s);
      m.set(s.day, list);
    }
    return m;
  }, [sessions]);

  const { year, month } = cursor;
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Monday-first: JS gives 0=Sunday, so rotate.
  const leadingBlanks = (first.getUTCDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  const visibleOfferings = offeringNames.filter((o) =>
    sessions.some((s) => s.offeringId === o.id),
  );

  function shift(by: number) {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + by, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCursor({ year: ty, month: tm - 1 })}
          >
            Today
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {visibleOfferings.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {visibleOfferings.map((o) => (
            <span
              key={o.id}
              className="flex items-center gap-1.5 text-xs text-ink-soft"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  DOT_COLOURS[colourFor(o.id)],
                )}
              />
              {o.title}
            </span>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[560px] overflow-hidden rounded-[var(--radius-card)] border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-paper">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) {
                return (
                  <div
                    key={`blank-${i}`}
                    className="min-h-24 border-b border-r border-line bg-paper/50 last:border-r-0"
                  />
                );
              }

              const key = ymd(year, month, day);
              const items = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              const isPast = key < todayKey;

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-24 border-b border-r border-line p-1.5 last:border-r-0",
                    isPast && "bg-paper/60",
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        "grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums",
                        isToday
                          ? "bg-brand-600 font-semibold text-white"
                          : isPast
                            ? "text-ink-faint"
                            : "text-ink-soft",
                      )}
                    >
                      {day}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {items.slice(0, 3).map((s) => {
                      const full = s.booked >= s.capacity;
                      return (
                        <Link
                          key={s.id}
                          href={`/studio/sessions/${s.id}`}
                          title={`${s.time} · ${s.title} · ${s.booked}/${s.capacity} booked`}
                          className={cn(
                            "block truncate rounded px-1.5 py-1 text-[11px] leading-tight transition-colors",
                            CHIP_COLOURS[colourFor(s.offeringId)],
                            s.status === "CANCELLED" &&
                              "line-through opacity-50",
                          )}
                        >
                          <span className="font-medium tabular-nums">
                            {s.time}
                          </span>{" "}
                          <span className="opacity-80">{s.title}</span>
                          {full ? <span className="ml-0.5">·full</span> : null}
                        </Link>
                      );
                    })}
                    {items.length > 3 ? (
                      <span className="block px-1.5 text-[11px] text-ink-faint">
                        +{items.length - 3} more
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
