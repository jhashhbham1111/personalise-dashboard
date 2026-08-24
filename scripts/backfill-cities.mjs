/**
 * One-off: normalise city spellings already in the database.
 *
 * Cities are canonicalised on write now, but every row saved before that still
 * holds whatever was typed — which is what put "Delhi" and "delhi" in the
 * dropdown as two separate options, each filtering to a different half of the
 * same city. The filters compare case-insensitively so they work either way;
 * this makes the stored data match what the app would write today.
 *
 * Safe to run more than once — rows already canonical are skipped.
 *
 *   node scripts/backfill-cities.mjs            # against .env's DATABASE_URL
 *   node scripts/backfill-cities.mjs --dry-run  # show what would change
 *
 * Against production, pass the Turso credentials the same way db:migrate does:
 *   DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" node scripts/backfill-cities.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const DRY_RUN = process.argv.includes("--dry-run");

const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

/* Kept in step with canonicalCity() in src/lib/utils.ts. */
const LOWER_INSIDE = new Set(["of", "on", "the", "and", "de", "da", "du", "van", "von"]);
const KEEP_UPPER = new Set(["NCR", "UK", "USA", "UAE", "US", "UP", "MP", "HSR", "BTM"]);

function canonicalCity(raw) {
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
          if (wordIndex > 0 && partIndex === 0 && LOWER_INSIDE.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(""),
    )
    .join(" ");
}

async function backfill(table, label) {
  const { rows } = await db.execute(
    `select id, city from ${table} where city is not null and city != ''`,
  );

  const changes = rows
    .map((r) => ({ id: r.id, from: r.city, to: canonicalCity(String(r.city)) }))
    .filter((c) => c.from !== c.to);

  console.log(`\n${label}: ${rows.length} row(s), ${changes.length} to update`);
  for (const c of changes) console.log(`  "${c.from}" → "${c.to}"`);

  if (!DRY_RUN) {
    for (const c of changes) {
      await db.execute({
        sql: `update ${table} set city = ? where id = ?`,
        args: [c.to, c.id],
      });
    }
  }
  return changes.length;
}

const updated =
  (await backfill("instructor_profiles", "Instructor profiles")) +
  (await backfill("venues", "Venues"));

console.log(
  DRY_RUN
    ? `\nDry run — ${updated} row(s) would change. Re-run without --dry-run to apply.`
    : `\nDone. ${updated} row(s) updated.`,
);

// Report what the city dropdown will now offer, which is the thing this is
// actually meant to fix.
const { rows: after } = await db.execute(
  `select distinct city from (
     select city from instructor_profiles where city != ''
     union all
     select city from venues where city != ''
   ) order by city`,
);
console.log(`\nCities now on file: ${after.map((r) => r.city).join(", ") || "(none)"}`);
