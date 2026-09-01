/**
 * Show (or clear the way for) an email verification code while testing locally.
 *
 * The code is only ever stored as a SHA-256 digest, so there is no column to
 * read it out of — this recovers it by hashing all million possibilities until
 * one matches. That takes a moment and is the point: a database dump gives an
 * attacker nothing they can type into the form.
 *
 * With NOTIFY_PROVIDER=console (the default) the code is already printed to
 * the `npm run dev` terminal as:
 *
 *     [email:mock] → someone@example.com :: 481920 is your Personalise verification code
 *
 * This script is for when that has scrolled away, or when you're testing
 * against a real inbox and don't want to wait for delivery.
 *
 *   node scripts/verification-code.mjs someone@example.com
 *   node scripts/verification-code.mjs someone@example.com --unlock
 *
 * --unlock also clears the rate limiters, which is the thing that actually
 * gets in the way when testing signup repeatedly: five code sends per 15
 * minutes per account, twenty checks, and ten signups per hour per IP.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";

const email = process.argv[2]?.trim().toLowerCase();
const unlock = process.argv.includes("--unlock");

if (!email) {
  console.error(
    "Usage: node scripts/verification-code.mjs <email> [--unlock]\n" +
      "       --unlock also clears the signup/verify rate limiters.",
  );
  process.exit(1);
}

const db = createClient({
  url: process.env.DATABASE_URL || "file:./dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const { rows: users } = await db.execute({
  sql: "select id, name, email_verified_at as verifiedAt from users where email = ?",
  args: [email],
});

if (users.length === 0) {
  console.log(`\nNo account with ${email}. Sign up first.\n`);
  db.close();
  process.exit(1);
}

const user = users[0];

if (unlock) {
  // Keyed per account and per IP; on a laptop the IP is always 127.0.0.1, so
  // clearing the table wholesale is simpler than guessing which key you hit.
  await db.execute("delete from rate_limit_hits");
  console.log("Rate limiters cleared.");
}

if (user.verifiedAt) {
  if (process.argv.includes("--reset")) {
    await db.execute({
      sql: "update users set email_verified_at = null where id = ?",
      args: [user.id],
    });
    console.log(
      `\n${email} is unverified again. Sign in and it will send a fresh code.\n`,
    );
  } else {
    console.log(
      `\n${email} is already verified — signing in goes straight to the dashboard.\n` +
        `To walk through the flow again with this same address:\n` +
        `  node scripts/verification-code.mjs ${email} --reset\n`,
    );
  }
  db.close();
  process.exit(0);
}

const { rows } = await db.execute({
  sql: `select code_hash as hash, expires_at as expiresAt, attempts
          from email_verification_codes
         where user_id = ? and consumed_at is null
         order by created_at desc limit 1`,
  args: [user.id],
});

if (rows.length === 0) {
  console.log(
    `\nNo live code for ${email}. Sign in, or press "Send a new code" on the ` +
      `verification screen.\n`,
  );
  db.close();
  process.exit(1);
}

const { hash, expiresAt, attempts } = rows[0];

if (Number(expiresAt) < Date.now()) {
  console.log(`\nThe last code for ${email} has expired. Send a new one.\n`);
  db.close();
  process.exit(1);
}

process.stdout.write("Recovering the code from its hash… ");
let found = null;
for (let i = 0; i < 1_000_000; i++) {
  const candidate = String(i).padStart(6, "0");
  if (createHash("sha256").update(candidate).digest("hex") === hash) {
    found = candidate;
    break;
  }
}

const minsLeft = Math.max(0, Math.round((Number(expiresAt) - Date.now()) / 60000));
console.log("done.\n");
console.log(`  account   ${user.name} <${email}>`);
console.log(`  code      ${found ?? "(not found — hash does not match any 6-digit code)"}`);
console.log(`  expires   in ${minsLeft} minute(s)`);
console.log(`  attempts  ${attempts} of 5 used\n`);

db.close();
