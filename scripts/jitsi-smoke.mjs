/**
 * Jitsi live-video provider: server-side grant issuance and the client wiring.
 *
 * This sandbox's network egress is allowlisted and does not include
 * meet.jit.si, so this suite can't prove real video actually connects end to
 * end — that has to be checked from a normal machine with real internet
 * access once deployed. What it CAN prove without leaving the box: the
 * server mints a "jitsi" grant with an obscured, deterministic room name
 * (never the raw session id), and the client component mounts, wires up its
 * script loader, and fails gracefully rather than crashing when that script
 * can't load — which is exactly what will instead succeed once it's
 * reachable.
 *
 * Run with the server already listening on BASE_URL, LIVE_PROVIDER=jitsi:
 *   LIVE_PROVIDER=jitsi node scripts/jitsi-smoke.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function login(page, email, password = "password123") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

try {
  const { rows: onlineOffering } = await db.execute(
    `select o.id as offeringId, o.title as title, o.instructor_id as instructorId
       from offerings o where o.mode in ('ONLINE','HYBRID') and o.is_active = 1 limit 1`,
  );
  if (onlineOffering.length === 0) {
    check("found an online offering to attach a test session to", false, "none in the seed data");
    throw new Error("no fixture");
  }
  const { offeringId, instructorId, title } = onlineOffering[0];

  const sessionId = `jitsi_smoke_${Date.now()}`;
  const now = Date.now();
  await db.execute({
    sql: `insert into class_sessions
            (id, offering_id, instructor_id, title, starts_at, ends_at, mode, capacity, status, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, 'ONLINE', 20, 'SCHEDULED', ?, ?)`,
    args: [sessionId, offeringId, instructorId, `${title} (jitsi smoke)`, now - 5 * 60_000, now + 55 * 60_000, now, now],
  });
  check("test session created within the join window", true, sessionId);

  /* --------------------------------- unauthenticated calls are still denied */
  const anonRes = await fetch(`${BASE}/api/live/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  check(
    "an unauthenticated request is still refused a token",
    anonRes.status === 401,
    `HTTP ${anonRes.status}`,
  );

  /* ------------------------------------------------- host gets a jitsi grant */
  const instructor = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(instructor, "ananya@personalise.app");

  const first = await instructor.evaluate(async (sid) => {
    const res = await fetch("/api/live/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid }),
    });
    return { status: res.status, json: await res.json() };
  }, sessionId);

  check(
    "the host gets back a jitsi grant",
    first.status === 200 && first.json?.grant?.provider === "jitsi",
    `HTTP ${first.status}, provider=${first.json?.grant?.provider}`,
  );

  const roomName = first.json?.grant?.roomName ?? "";
  check(
    "the room name is obscured, not the raw session id",
    roomName.startsWith("personalise-") &&
      roomName.length > 20 &&
      !roomName.includes(sessionId),
    roomName,
  );
  check(
    "no bearer token is issued for the public server (nothing to leak)",
    first.json?.grant?.token === "",
  );
  check(
    "the grant points at the configured Jitsi domain",
    typeof first.json?.grant?.serverUrl === "string" && first.json.grant.serverUrl.length > 0,
    first.json?.grant?.serverUrl,
  );

  const second = await instructor.evaluate(async (sid) => {
    const res = await fetch("/api/live/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid }),
    });
    return { status: res.status, json: await res.json() };
  }, sessionId);
  check(
    "rejoining lands in the exact same room",
    second.json?.grant?.roomName === roomName,
    `${second.json?.grant?.roomName} vs ${roomName}`,
  );

  /* --------------------------------- the client mounts without crashing */
  const pageErrors = [];
  instructor.on("pageerror", (err) => pageErrors.push(err.message));

  await instructor.goto(`${BASE}/live/${sessionId}`, { waitUntil: "domcontentloaded" });

  // This sandbox's egress doesn't reach meet.jit.si (ERR_TUNNEL_CONNECTION_FAILED),
  // so the component's own error path is what should show up here — proving
  // the load failure is caught and handled, not that it silently hangs or
  // throws. On a normal connection this same code path instead succeeds and
  // the embedded Jitsi meeting loads in the header's place.
  const errorHeading = instructor.getByRole("heading", { name: "Couldn't load the video call" });
  const sawGracefulHandling = await errorHeading
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check(
    "an unreachable video script fails gracefully rather than crashing the page",
    sawGracefulHandling && pageErrors.length === 0,
    sawGracefulHandling
      ? "showed the 'couldn't load' screen as expected in this sandbox"
      : `no error screen appeared within 15s (page errors: ${pageErrors.join("; ")})`,
  );

  await instructor.close();

  await db.execute({ sql: `delete from class_sessions where id = ?`, args: [sessionId] });
} catch (err) {
  check("jitsi flow completed without throwing", false, String(err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
