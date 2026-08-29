/**
 * One-off: trim every instructor profile to a single discipline.
 *
 * Onboarding used to be "tick all that apply", which meant a class created
 * later couldn't tell which of an instructor's disciplines it belonged to —
 * so the class form asked a second time. Onboarding now asks for one, and
 * every class inherits it. This brings profiles saved under the old form
 * into line by keeping the first discipline they chose.
 *
 * Nothing is lost that the app was using: only the first entry ever decided
 * a class's discipline, and the instructor filter matches a single value.
 * An instructor who wants a different one changes it in Studio → My profile.
 *
 * Safe to run more than once — profiles already holding one are skipped.
 *
 *   node scripts/backfill-primary-discipline.mjs            # against .env's DATABASE_URL
 *   node scripts/backfill-primary-discipline.mjs --dry-run  # show what would change
 *
 * Against production, pass the Turso credentials the same way db:migrate does:
 *   DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" node scripts/backfill-primary-discipline.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const DRY_RUN = process.argv.includes("--dry-run");

const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const { rows } = await db.execute(
  "select id, slug, disciplines from instructor_profiles",
);

let changed = 0;
let skipped = 0;
const noneAtAll = [];

for (const row of rows) {
  let list;
  try {
    list = JSON.parse(row.disciplines ?? "[]");
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  if (list.length === 0) {
    // Left alone deliberately: there's nothing to pick from, and writing a
    // guess here would put a discipline on a profile its owner never chose.
    noneAtAll.push(row.slug);
    continue;
  }
  if (list.length === 1) {
    skipped++;
    continue;
  }

  const next = JSON.stringify([list[0]]);
  console.log(
    `${row.slug}: ${JSON.stringify(list)} -> ${next}${DRY_RUN ? "  (dry run)" : ""}`,
  );
  if (!DRY_RUN) {
    await db.execute({
      sql: "update instructor_profiles set disciplines = ? where id = ?",
      args: [next, row.id],
    });
  }
  changed++;
}

console.log(
  `\n${changed} profile(s) trimmed, ${skipped} already had one, ${rows.length} total.`,
);
if (noneAtAll.length > 0) {
  console.log(
    `\n${noneAtAll.length} profile(s) have no discipline at all and were left alone:\n  ${noneAtAll.join("\n  ")}`,
  );
  console.log(
    "Their classes fall back to whatever discipline each class already has.\n" +
      "Ask those instructors to set one in Studio → My profile.",
  );
}
if (DRY_RUN) console.log("\nDry run — nothing was written.");

db.close();
