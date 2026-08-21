"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, Search, User, X } from "lucide-react";

import { searchStudentsAction } from "../actions";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Match = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  known: boolean;
};

/** Enough of an address to tell two people apart without printing it in full. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shown = local.slice(0, 2);
  return `${shown}${local.length > 2 ? "…" : ""}@${domain}`;
}

/**
 * Search-as-you-type student picker.
 *
 * Typing an exact email address is the one thing an instructor can't do with a
 * queue of people in front of them; they know a name and maybe a number. This
 * matches all three, but always resolves to a specific account id before the
 * form submits — matching on a name alone is how the wrong student's pass gets
 * activated, and two people called Priya Sharma is not a hypothetical.
 */
export function StudentPicker({ error }: { error?: string }) {
  const [query, setQuery] = useState("");
  // Results are stored with the query they belong to, so a stale response for
  // an earlier keystroke is discarded by comparison rather than by clearing
  // state from inside the effect.
  const [fetched, setFetched] = useState<{ query: string; rows: Match[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<Match | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const searchable = !selected && trimmed.length >= 2;
  const results = fetched?.query === trimmed ? fetched.rows : [];
  const open = searchable && !dismissed;

  useEffect(() => {
    if (!searchable) return;
    // Debounced: an instructor types faster than a round trip, and firing on
    // every keystroke means results arrive out of order.
    const t = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchStudentsAction(trimmed);
        setFetched({ query: trimmed, rows });
      });
    }, 250);
    return () => clearTimeout(t);
  }, [trimmed, searchable]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setDismissed(true);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  if (selected) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Student</span>
        <input type="hidden" name="studentId" value={selected.id} />
        <div className="flex items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Check className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">
              {selected.name}
            </span>
            <span className="block truncate text-xs text-ink-soft">
              {selected.email}
              {selected.phone ? ` · ${selected.phone}` : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="rounded p-1 text-ink-faint transition-colors hover:bg-brand-100 hover:text-ink"
            aria-label="Choose a different student"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef}>
      <label
        htmlFor="student-search"
        className="mb-1.5 block text-sm font-medium text-ink"
      >
        Student
        {error ? (
          <span className="ml-2 text-xs font-normal text-danger-700">{error}</span>
        ) : null}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          id="student-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDismissed(false);
          }}
          onFocus={() => setDismissed(false)}
          placeholder="Search by name, email or phone"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className="pl-9"
        />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line-strong bg-surface shadow-sm"
        >
          {(pending || fetched?.query !== trimmed) && results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-faint">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-soft">
              No student account matches that. They need to sign up first — send
              them your public page link.
            </li>
          ) : (
            results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setSelected(m);
                    setDismissed(true);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-brand-50"
                >
                  <User className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {m.name}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {maskEmail(m.email)}
                      {m.phone ? ` · ${m.phone}` : ""}
                    </span>
                  </span>
                  {m.known ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full bg-brand-100 px-2 py-0.5",
                        "text-[11px] font-medium text-brand-800",
                      )}
                    >
                      Your student
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
