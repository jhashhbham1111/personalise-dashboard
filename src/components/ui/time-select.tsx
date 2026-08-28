"use client";

import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseHHMM(value: string): { h: number; m: number } {
  const [hh, mm] = value.split(":").map(Number);
  const h = isNaN(hh) ? 6 : Math.max(0, Math.min(23, hh));
  const raw = isNaN(mm) ? 30 : Math.max(0, Math.min(59, mm));
  const m = Math.round(raw / 5) * 5 >= 60 ? 55 : Math.round(raw / 5) * 5;
  return { h, m };
}

/**
 * Paired hour + minute selects that submit a single HH:MM value.
 *
 * Replaces <input type="time" step={300}> which uses the native OS time
 * picker — on iOS and Chrome's phone emulator the scroll wheel in that picker
 * does not respond to simulated touch events and the step attribute is ignored
 * entirely. Two <select> elements work on every mobile browser, require no
 * touch simulation, and naturally enforce the 5-minute grid.
 */
export function TimeSelect({
  id,
  name,
  defaultValue = "06:30",
  required,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const init = parseHHMM(defaultValue);
  const [hour, setHour] = useState(init.h);
  const [minute, setMinute] = useState(init.m);

  const combined = `${pad(hour)}:${pad(minute)}`;

  return (
    <div className="flex items-center gap-2">
      {/* Hidden input carries the HH:MM value that the server action reads */}
      <input type="hidden" name={name} value={combined} />

      <select
        id={id}
        aria-label="Hour"
        value={hour}
        onChange={(e) => setHour(Number(e.target.value))}
        required={required}
        className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </select>

      <span className="text-sm font-medium text-ink-soft select-none">:</span>

      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => setMinute(Number(e.target.value))}
        className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
