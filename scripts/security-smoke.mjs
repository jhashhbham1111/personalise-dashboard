/**
 * Security regression test.
 *
 * Each check here is a real attack that used to succeed. They're kept as tests
 * rather than notes because "we fixed that" decays — a future refactor that
 * drops an ownership check would pass every other suite in this repo.
 *
 * Run with the server already listening on BASE_URL:
 *   node scripts/security-smoke.mjs
 */
import { createClient } from "@libsql/client";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = createClient({
  url: process.env.DATABASE_URL || "file:dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const out = [];
const check = (n, p, d="") => { out.push([n,p]); console.log(`${p?"  PASS":"  FAIL"}  ${n}${d?` — ${d}`:""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

// --- IDOR: a signed-in stranger tries to cancel someone else's booking
const { rows: victim } = await db.execute(
  `select b.id as bid, b.student_id as sid from bookings b
   join users u on u.id=b.student_id where u.email='student@personalise.app'
   and b.status='CONFIRMED' limit 1`);

const atk = await browser.newPage();
const atkEmail = `attacker-${Date.now()}@example.com`;
await atk.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
await atk.fill('input[name="name"]', "Attacker");
await atk.fill('input[name="email"]', atkEmail);
await atk.fill('input[name="password"]', "attacker123");
await atk.click('button[type="submit"]');
await atk.waitForURL(u => !u.pathname.startsWith("/signup"), { timeout: 20000 });

// Post directly to the server action the cancel button uses.
const res = await atk.evaluate(async (bid) => {
  const r = await fetch("/dashboard/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `bookingId=${encodeURIComponent(bid)}`,
  });
  return r.status;
}, victim[0].bid);

const { rows: after } = await db.execute({
  sql: "select status from bookings where id = ?", args: [victim[0].bid] });
check("victim's booking survives a forged cancel", after[0].status === "CONFIRMED",
      `status=${after[0].status} (http ${res})`);

// --- Open redirect on the post-login destination
await atk.goto(`${BASE}/login?next=https://example.com/pwned`, { waitUntil: "domcontentloaded" });
await atk.fill('input[name="email"]', atkEmail);
await atk.fill('input[name="password"]', "attacker123");
await atk.click('button[type="submit"]');
await atk.waitForTimeout(2500);
check("login ignores an external next= target", new URL(atk.url()).origin === BASE, atk.url());
await atk.close();

// --- Brute-force protection on login
let limited = false;
for (let i = 0; i < 12; i++) {
  const p = await browser.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"]', "student@personalise.app");
  await p.fill('input[name="password"]', `wrong-${i}`);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(500);
  const t = (await p.locator("body").innerText()).toLowerCase();
  if (t.includes("too many")) limited = true;
  await p.close();
  if (limited) break;
}
check("repeated bad passwords get rate limited", limited);

await browser.close();
const failed = out.filter(([,p]) => !p);
console.log(`\n${out.length-failed.length}/${out.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
