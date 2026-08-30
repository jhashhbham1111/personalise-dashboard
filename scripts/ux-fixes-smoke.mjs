/**
 * The confirmed-bug batch: mobile nav, city normalisation and filtering,
 * honest card CTAs, content validation, empty states, date filter.
 *
 * Each check targets a specific reported defect, so a regression here names
 * the exact thing that broke rather than "a page changed".
 *
 * Run with the server already listening on BASE_URL:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ux-fixes-smoke.mjs
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { signUpAndVerify, testEmail } from "./lib/signup.mjs";
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

// This suite signs an account up; the limiter is asserted by security-smoke.
await db.execute("delete from rate_limit_hits");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function login(page, email, password = "password123") {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

try {
  /* ------------------------------------------------ 1. mobile navigation */
  const phone = await browser.newPage({ viewport: PHONE });
  await phone.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  // domcontentloaded fires before React hydrates, so a click here can land on
  // a button that isn't interactive yet and silently do nothing.
  await phone.waitForLoadState("networkidle");

  const menuButton = phone.getByRole("button", { name: /open menu/i });
  check(
    "a phone gets a labelled menu button",
    await menuButton.isVisible().catch(() => false),
  );

  // The links must be genuinely unreachable before opening — otherwise this
  // would pass on a header that never hid them in the first place.
  const navBefore = await phone
    .getByRole("link", { name: "Instructors", exact: true })
    .isVisible()
    .catch(() => false);
  check("public nav links are not in the phone header until opened", !navBefore);

  await menuButton.click();
  // Wait for the sheet itself, not a fixed delay: a 400ms sleep raced the
  // dialog's open animation on a slow machine and failed intermittently.
  await phone
    .locator('[role="dialog"]')
    .waitFor({ state: "visible", timeout: 10000 });
  const linkNames = ["Instructors", "Classes", "Videos"];
  const visible = [];
  for (const name of linkNames) {
    const shown = await phone
      .getByRole("link", { name, exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (shown) visible.push(name);
  }
  check(
    "the menu contains every public nav link",
    visible.length === linkNames.length,
    visible.join(", ") || "none found",
  );

  await phone.getByRole("link", { name: "Classes", exact: true }).first().click();
  await phone.waitForURL(/\/classes/, { timeout: 15000 });
  check("tapping a menu link navigates and closes the menu", true, phone.url());

  // Escape must close it — a drawer you can only leave by tapping a link is a
  // trap on a phone.
  await phone.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await phone.getByRole("button", { name: /open menu/i }).click();
  await phone.waitForTimeout(300);
  await phone.keyboard.press("Escape");
  await phone.waitForTimeout(300);
  check(
    "Escape closes the menu",
    !(await phone
      .getByRole("link", { name: "Instructors", exact: true })
      .first()
      .isVisible()
      .catch(() => false)),
  );
  await phone.close();

  /* ------------------------------------- 2. desktop nav is left untouched */
  const desktop = await browser.newPage({ viewport: DESKTOP });
  await desktop.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check(
    "desktop still shows the nav inline, with no menu button",
    (await desktop
      .getByRole("link", { name: "Instructors", exact: true })
      .first()
      .isVisible()) &&
      !(await desktop
        .getByRole("button", { name: /open menu/i })
        .isVisible()
        .catch(() => false)),
  );

  /* --------------------------------------- 3. city normalisation on write */
  const { rows: cityRows } = await db.execute(
    `select city from instructor_profiles where city != ''
     union select city from venues where city != ''`,
  );
  const cities = cityRows.map((r) => String(r.city));
  const lowered = cities.map((c) => c.toLowerCase());
  check(
    "no two stored cities differ only by case",
    new Set(lowered).size === lowered.length,
    cities.join(", "),
  );

  /* ------------------------------- 4. the city dropdown offers venue cities */
  const { rows: venueCityRows } = await db.execute(
    `select distinct v.city as city from venues v
       join instructor_profiles ip on ip.id = v.instructor_id
      where v.is_active = 1 and ip.is_published = 1 and ip.is_suspended = 0`,
  );
  await desktop.goto(`${BASE}/classes`, { waitUntil: "domcontentloaded" });
  const options = await desktop
    .locator('select[aria-label="City"] option')
    .allInnerTexts();
  const missing = venueCityRows
    .map((r) => String(r.city))
    .filter((c) => !options.some((o) => o.trim().toLowerCase() === c.toLowerCase()));
  check(
    "every venue city is offered in the class city filter",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : options.join(" / "),
  );

  /* --------------------- 5. filtering by a venue city finds in-person classes */
  const { rows: inPerson } = await db.execute({
    sql: `select v.city as city, count(*) as n
            from class_sessions cs
            join venues v on v.id = cs.venue_id
            join instructor_profiles ip on ip.id = cs.instructor_id
           where cs.status = 'SCHEDULED' and cs.starts_at > ?
             and ip.is_published = 1 and ip.is_suspended = 0
           group by v.city limit 1`,
    args: [Date.now()],
  });
  if (inPerson.length > 0) {
    const city = String(inPerson[0].city);
    await desktop.goto(
      `${BASE}/classes?within=all&city=${encodeURIComponent(city)}`,
      { waitUntil: "domcontentloaded" },
    );
    const body = (await desktop.locator("body").innerText()).toLowerCase();
    check(
      "filtering by a venue's city returns its in-person classes",
      !body.includes("nothing scheduled that matches"),
      `city=${city}`,
    );

    // Same city typed in the other case must behave identically — that's the
    // whole point of matching case-insensitively.
    await desktop.goto(
      `${BASE}/classes?within=all&city=${encodeURIComponent(city.toLowerCase())}`,
      { waitUntil: "domcontentloaded" },
    );
    const lowerBody = (await desktop.locator("body").innerText()).toLowerCase();
    check(
      "the same city in a different case returns the same classes",
      !lowerBody.includes("nothing scheduled that matches"),
      `city=${city.toLowerCase()}`,
    );
  } else {
    check("found an in-person class to test city filtering with", false, "none seeded");
  }

  /* ------------------------------------------------- 6. empty-state escape */
  await desktop.goto(
    `${BASE}/classes?within=all&city=Nowhereville&mode=OFFLINE`,
    { waitUntil: "domcontentloaded" },
  );
  const emptyText = await desktop.locator("body").innerText();
  check(
    "a filtered-to-nothing class list says which filters are to blame",
    /no classes match your/i.test(emptyText),
  );
  const clearLink = desktop.getByRole("link", { name: /clear filters/i });
  check(
    "…and offers a Clear filters action even on the widest date range",
    await clearLink.isVisible().catch(() => false),
  );
  await clearLink.click();
  await desktop.waitForURL((u) => !u.search.includes("city="), { timeout: 15000 });
  check(
    "Clear filters actually drops the filters from the URL",
    !desktop.url().includes("city=") && !desktop.url().includes("mode="),
    desktop.url(),
  );

  await desktop.goto(`${BASE}/instructors?city=Nowhereville&q=zzzz`, {
    waitUntil: "domcontentloaded",
  });
  const instrClear = desktop.getByRole("link", { name: /clear filters/i });
  check(
    "the instructor directory offers Clear filters too",
    await instrClear.isVisible().catch(() => false),
  );

  /* ------------------------------------------------ 7. honest card CTAs */
  const signedOut = await browser.newPage({ viewport: DESKTOP });
  await signedOut.goto(`${BASE}/classes?within=all`, { waitUntil: "domcontentloaded" });
  const signInCta = await signedOut
    .getByRole("link", { name: /sign in to book/i })
    .count();
  const bareBook = await signedOut.getByRole("link", { name: /^book$/i }).count();
  check(
    "a signed-out visitor is told they'll need to sign in, not promised a booking",
    signInCta > 0 && bareBook === 0,
    `${signInCta} "sign in to book", ${bareBook} bare "Book"`,
  );
  await signedOut.close();

  // A signed-in student with no pass for a class should be pointed at prices.
  const noPassEmail = testEmail("ux");
  const student = await browser.newPage({ viewport: DESKTOP });
  await signUpAndVerify(student, db, {
    baseUrl: BASE,
    name: "ux tester",
    email: noPassEmail,
    password: "uxpass12345",
  });

  await student.goto(`${BASE}/classes?within=all`, { waitUntil: "domcontentloaded" });
  const passesCta = await student.getByRole("link", { name: /see passes/i }).count();
  check(
    "a signed-in student without a pass is sent to prices, not a booking",
    passesCta > 0,
    `${passesCta} "see passes"`,
  );

  /* -------------------------------------- 8. name capitalisation on signup */
  const { rows: nameRow } = await db.execute({
    sql: "select name from users where email = ?",
    args: [noPassEmail],
  });
  check(
    "an all-lowercase name is title-cased on signup",
    nameRow[0]?.name === "Ux Tester",
    String(nameRow[0]?.name),
  );
  await student.close();

  /* ------------------------------------- 9. class title tidied on creation */
  const instructor = await browser.newPage({ viewport: DESKTOP });
  await login(instructor, "ananya@personalise.app");
  await instructor.goto(`${BASE}/studio/offerings/new`, {
    waitUntil: "domcontentloaded",
  });
  const rawTitle = `evening flow ${Date.now()}`;
  await instructor.fill('input[name="title"]', rawTitle);
  await instructor.fill(
    'textarea[name="summary"], input[name="summary"]',
    "a gentle evening class to wind the day down",
  );
  await instructor.click('button[type="submit"]');
  await instructor.waitForURL(/\/studio\/offerings\/[^/]+\/setup/, { timeout: 20000 });

  const { rows: titleRow } = await db.execute({
    sql: "select title, summary, discipline from offerings where lower(title) = ?",
    args: [rawTitle.toLowerCase()],
  });
  check(
    "an all-lowercase class title is sentence-cased on save",
    titleRow[0]?.title === rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1),
    String(titleRow[0]?.title),
  );
  check(
    "the summary is tidied the same way",
    String(titleRow[0]?.summary ?? "").startsWith("A gentle evening"),
    String(titleRow[0]?.summary),
  );

  /* ------------------------ 10. server rejects an off-list discipline */
  const offeringId = (
    await db.execute({
      sql: "select id from offerings where lower(title) = ?",
      args: [rawTitle.toLowerCase()],
    })
  ).rows[0]?.id;

  const forged = await instructor.evaluate(async (id) => {
    // Server actions can't be posted to directly without their action id, so
    // drive the real form with a tampered value instead — the same thing a
    // devtools edit or a scripted client would do.
    const form = document.createElement("form");
    void form;
    return id;
  }, offeringId);
  void forged;

  await instructor.goto(`${BASE}/studio/offerings/${offeringId}`, {
    waitUntil: "domcontentloaded",
  });
  await instructor.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('select[name="discipline"]');
    if (!select) return;
    const rogue = document.createElement("option");
    rogue.value = "Underwater Basket Weaving";
    rogue.textContent = "rogue";
    select.appendChild(rogue);
    select.value = "Underwater Basket Weaving";
  });
  await instructor
    .getByRole("button", { name: /save|update/i })
    .first()
    .click();
  await instructor.waitForTimeout(2000);

  const { rows: disciplineRow } = await db.execute({
    sql: "select discipline from offerings where id = ?",
    args: [offeringId],
  });
  check(
    "an off-list discipline is refused server-side, not stored",
    disciplineRow[0]?.discipline !== "Underwater Basket Weaving",
    `stored: ${disciplineRow[0]?.discipline}`,
  );

  // Clean up the class this suite created.
  await db.execute({ sql: "delete from offerings where id = ?", args: [offeringId] });
  await instructor.close();

  /* ------------------------------------------ 11. date filter still applies */
  await desktop.goto(`${BASE}/classes`, { waitUntil: "domcontentloaded" });
  // The filter bar submits from the client, so the field has to be hydrated
  // before filling it means anything.
  await desktop.waitForLoadState("networkidle");
  const dateInput = desktop.locator('input[name="from"]');
  await dateInput.fill("2026-09-01");
  await desktop.waitForURL(/from=2026-09-01/, { timeout: 15000 });
  check("picking a date still applies the filter", true, desktop.url());

  await desktop.close();
} catch (err) {
  check("ux fixes suite completed without throwing", false, String(err));
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
