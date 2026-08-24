import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse a JSON-encoded list column, never throwing. */
export function parseList<T = string>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export function stringifyList(list: readonly unknown[]): string {
  return JSON.stringify(list ?? []);
}

/** Money is stored as integer paise. Render as ₹1,200 or ₹1,200.50. */
export function formatMoney(paise: number, currency = "INR"): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function rupeesToPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Words that stay lowercase inside a longer name, and initialisms that stay
 * upper. Without these, title-casing turns "Navi Mumbai" fine but mangles
 * "Rann of Kutch" into "Rann Of Kutch" and "NCR" into "Ncr".
 */
const LOWER_INSIDE = new Set(["of", "on", "the", "and", "de", "da", "du", "van", "von"]);
const KEEP_UPPER = new Set(["NCR", "UK", "USA", "UAE", "US", "UP", "MP", "HSR", "BTM"]);

/**
 * Canonical form for a place name typed by a human.
 *
 * Cities are free text on a form, so "Delhi", "delhi" and " DELHI " all
 * arrived as distinct values — three separate entries in the city dropdown,
 * each filtering to a different slice of the same city. Normalising on write
 * makes one city one value; `sameCity` covers rows written before this existed.
 *
 * Hyphens and apostrophes are treated as word boundaries so "pondicherry-east"
 * and "o'valley" capitalise like the multi-word names they are.
 */
export function canonicalCity(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word, wordIndex) =>
      word
        .split(/([-'’])/)
        .map((part, partIndex) => {
          if (!/[a-z0-9]/i.test(part)) return part;
          const upper = part.toUpperCase();
          if (KEEP_UPPER.has(upper)) return upper;
          // Only a whole interior word may stay lowercase — never the first
          // word, and never a fragment of a hyphenated one.
          if (wordIndex > 0 && partIndex === 0 && LOWER_INSIDE.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(""),
    )
    .join(" ");
}

/** Case- and whitespace-insensitive city comparison key. */
export function cityKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Sentence-cases a title that was typed in all lower or all upper case,
 * leaving deliberate mixed-case titles ("Morning Vinyasa with Ananya",
 * "yoga for BJJ") exactly as written.
 *
 * Deliberately conservative: it only steps in when the whole string is
 * single-case, because there is no way to tell a stylised title from a sloppy
 * one, and rewriting someone's class name is worse than leaving it be.
 */
export function tidyTitle(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const letters = trimmed.replace(/[^a-z]/gi, "");
  const allLower = letters.length > 0 && letters === letters.toLowerCase();
  const allUpper = letters.length > 1 && letters === letters.toUpperCase();
  if (!allLower && !allUpper) return trimmed;

  const base = allUpper ? trimmed.toLowerCase() : trimmed;
  // Capitalise the first letter of each sentence, not each word — a class
  // title is a name, not a headline.
  return base.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead: string, ch: string) =>
    `${lead}${ch.toUpperCase()}`,
  );
}

/** Title-cases a person's name typed as "priya sharma" or "PRIYA SHARMA". */
export function tidyPersonName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const letters = trimmed.replace(/[^a-z]/gi, "");
  const allLower = letters.length > 0 && letters === letters.toLowerCase();
  const allUpper = letters.length > 1 && letters === letters.toUpperCase();
  if (!allLower && !allUpper) return trimmed;

  return trimmed
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word
        .split(/([-'’])/)
        .map((part) =>
          /[a-z]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part,
        )
        .join(""),
    )
    .join(" ");
}

/**
 * "discipline, city and format filters" — names what's narrowing a result set
 * so an empty state can say why it's empty instead of just that it is.
 */
export function listFilters(names: string[]): string {
  if (names.length === 0) return "filters";
  if (names.length === 1) return `${names[0]} filter`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")} and ${last} filters`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
