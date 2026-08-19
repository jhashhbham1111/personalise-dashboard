/**
 * Make a class live right now, for testing the in-app class room.
 *
 * The live room only opens 15 minutes before a class starts, so none of the
 * seeded classes (6:30am, 7pm…) is joinable at an arbitrary moment. This
 * picks an online class the demo student is booked into and moves it to
 * "started five minutes ago, running for another 55", then prints the URL.
 *
 *   npm run make-live
 *
 * Re-run it any time you want a fresh live class. It only ever changes one
 * session's start/end time — everything else in your data is left alone.
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const { rows } = await db.execute({
  sql: `select cs.id as id, cs.title as title, u.name as student
        from class_sessions cs
        join bookings b on b.session_id = cs.id
        join users u on u.id = b.student_id
        where cs.mode = ? and b.status = ?
        order by cs.starts_at asc
        limit 1`,
  args: ["ONLINE", "CONFIRMED"],
});

if (rows.length === 0) {
  console.error(
    "\nNo online class with a confirmed booking found." +
      "\nRun `npm run db:reset` to restore the demo data, then try again.\n",
  );
  process.exit(1);
}

const { id, title, student } = rows[0];
const now = Date.now();

await db.execute({
  sql: "update class_sessions set starts_at = ?, ends_at = ?, status = ?, live_ended_at = null, is_recording = 0 where id = ?",
  args: [now - 5 * 60_000, now + 55 * 60_000, "SCHEDULED", id],
});

const url = `${process.env.APP_URL || "http://localhost:3000"}/live/${id}`;

console.log(`
"${title}" is now live for the next 55 minutes.

  ${url}

Open that as the instructor:  ananya@personalise.app
And in an incognito window as: ${student.includes("@") ? student : "student@personalise.app"}
Password for both:             password123
`);
