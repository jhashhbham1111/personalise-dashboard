/**
 * Play Store readiness smoke test.
 *
 * Google Play's pre-launch checks are a list of things that must be *reachable
 * and correct on the deployed site*, not things that must exist in the repo.
 * A privacy policy that 500s, a manifest whose icons 404, an account-deletion
 * page that redirects a signed-out visitor to /login — each of those is a
 * rejection, and each looks fine from the code. So this suite asks the running
 * server.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/playstore-smoke.mjs
 *
 * Set BASE_URL to point it at the deployment instead of localhost.
 */

import { chromium } from "playwright";
import { skipFirstRunScreensEverywhere } from "./lib/signup.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
// The launch screen and first-run intro are full-screen overlays for a
// first-time visitor; without this they silently swallow the suite's clicks.
skipFirstRunScreensEverywhere(browser);

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  /* --------------------------------------------------------- the manifest */
  const manifestRes = await page.goto(`${BASE}/manifest.webmanifest`, {
    waitUntil: "domcontentloaded",
  });
  check("manifest is served", manifestRes?.status() === 200, `HTTP ${manifestRes?.status()}`);

  const manifest = await manifestRes.json();
  check("manifest has a name and a short_name", !!manifest.name && !!manifest.short_name,
    manifest.short_name);
  check("manifest is standalone", manifest.display === "standalone", manifest.display);
  check("manifest has a start_url", manifest.start_url === "/", manifest.start_url);

  // Bubblewrap refuses to generate a package without a 512px icon, and Android
  // shows a grey square instead of the app icon without a maskable one.
  const bySize = (s, purpose) =>
    (manifest.icons || []).find(
      (i) => i.sizes === s && (i.purpose || "any").split(" ").includes(purpose),
    );
  check("manifest declares a 192px icon", !!bySize("192x192", "any"));
  check("manifest declares a 512px icon", !!bySize("512x512", "any"));
  check("manifest declares a maskable 512px icon", !!bySize("512x512", "maskable"));
  check("manifest declares a monochrome icon", !!bySize("512x512", "monochrome"));

  /*
   * The icons must actually exist. A manifest that names a missing file is
   * the failure that gets past code review every time, because the manifest
   * itself validates perfectly.
   */
  for (const icon of manifest.icons || []) {
    const res = await page.request.get(`${BASE}${icon.src}`);
    const type = res.headers()["content-type"] || "";
    check(
      `icon ${icon.src} is a real image`,
      res.status() === 200 && type.startsWith("image/"),
      `HTTP ${res.status()} ${type}`,
    );
  }

  const appleRes = await page.request.get(`${BASE}/icons/apple-touch-icon.png`);
  check("apple-touch-icon exists", appleRes.status() === 200, `HTTP ${appleRes.status()}`);

  /* ------------------------------------------------------ theme + viewport */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  const themeColor = await page
    .locator('meta[name="theme-color"]')
    .first()
    .getAttribute("content")
    .catch(() => null);
  check(
    "theme-color matches the manifest",
    themeColor?.toLowerCase() === String(manifest.theme_color).toLowerCase(),
    `${themeColor} vs ${manifest.theme_color}`,
  );

  const viewport = await page
    .locator('meta[name="viewport"]')
    .first()
    .getAttribute("content");
  // Without viewport-fit=cover, env(safe-area-inset-*) computes to 0 and the
  // live room's controls sit under the home indicator.
  check("viewport opts into the safe area", /viewport-fit=cover/.test(viewport || ""), viewport);
  check("viewport is device-width", /width=device-width/.test(viewport || ""));
  // Play's accessibility review flags a page that blocks pinch-zoom.
  check("pinch-zoom is not disabled", !/user-scalable=no|maximum-scale=1/.test(viewport || ""));

  check(
    "the manifest is linked from the page",
    (await page.locator('link[rel="manifest"]').count()) > 0,
  );
  check(
    "apple-touch-icon is linked (iOS ignores the manifest)",
    (await page.locator('link[rel="apple-touch-icon"]').count()) > 0,
  );

  /* -------------------------------------------------------- no demo claims */
  const homeText = await page.locator("body").innerText();
  check(
    "the footer no longer calls this a demo with fictional instructors",
    !/demo application/i.test(homeText) && !/are\s+fictional/i.test(homeText),
  );

  /*
   * With LIVE_PROVIDER=mock there is no media server, so any promise of a
   * built-in room with screen share is a claim the deployment cannot keep.
   * The copy is derived from the flag in src/lib/capabilities.ts, so this
   * check passes in both configurations — it fails only if someone hard-codes
   * the promise back into the page.
   */
  const liveIsMock = !process.env.LIVE_PROVIDER || process.env.LIVE_PROVIDER === "mock";
  if (liveIsMock) {
    check(
      "no in-app live-video promise while the live provider is mock",
      !/screen share and recording, built in/i.test(homeText),
    );
  }
  const paymentsOn =
    process.env.ONLINE_PAYMENTS === "on" && process.env.PAYMENT_PROVIDER === "razorpay";
  if (!paymentsOn) {
    check(
      "no in-app UPI checkout promise while online payments are off",
      !/Pay by UPI in a few taps/i.test(homeText),
    );
  }

  /* ------------------------------------------------ legal pages, signed out */
  for (const [path, mustSay] of [
    ["/legal/privacy", /privacy/i],
    ["/legal/terms", /terms/i],
    ["/legal/refunds", /refund/i],
    ["/contact", /contact/i],
    // Play requires this one to be reachable from outside the app, by someone
    // who is not signed in and possibly cannot sign in any more.
    ["/account/delete", /delete/i],
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const ok = res?.status() === 200 && !page.url().includes("/login");
    check(`${path} loads for a signed-out visitor`, ok,
      `HTTP ${res?.status()} → ${new URL(page.url()).pathname}`);
    if (ok) {
      check(`${path} says what it is`, mustSay.test(await page.locator("body").innerText()));
    }
  }

  /* --------------------------------------- every one of them is linked to */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  for (const href of [
    "/legal/privacy",
    "/legal/terms",
    "/legal/refunds",
    "/contact",
    "/account/delete",
  ]) {
    check(
      `${href} is reachable from the footer`,
      (await page.locator(`footer a[href="${href}"]`).count()) > 0,
    );
  }

  /* ------------------------------------------------------------ assetlinks */
  const alRes = await page.request.get(`${BASE}/.well-known/assetlinks.json`);
  if (process.env.ANDROID_PACKAGE_NAME && process.env.ANDROID_SHA256_FINGERPRINTS) {
    const body = await alRes.json();
    check("assetlinks.json is served", alRes.status() === 200, `HTTP ${alRes.status()}`);
    check("assetlinks.json is an array of statements", Array.isArray(body));
    check(
      "the statement delegates URL handling to the Android package",
      body[0]?.relation?.includes("delegate_permission/common.handle_all_urls") &&
        body[0]?.target?.namespace === "android_app",
    );
    check(
      "the fingerprint is well formed",
      /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(body[0]?.target?.sha256_cert_fingerprints?.[0] || ""),
    );
  } else {
    // The honest answer before an Android build exists. A 200 with empty
    // fields would be worse: the verifier reports both as "no matching
    // statement", and only one of them tells you why.
    check(
      "assetlinks.json 404s while no Android package is configured",
      alRes.status() === 404,
      `HTTP ${alRes.status()}`,
    );
  }

  /* ------------------------------------------- phone layout doesn't overflow */
  for (const path of ["/", "/instructors", "/legal/privacy", "/account/delete"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`${path} doesn't scroll sideways on a 390px phone`, overflow <= 1, `${overflow}px`);
  }

  await page.close();
} catch (err) {
  console.error("FATAL:", err);
  results.push({ name: "suite completed without an exception", passed: false, detail: String(err) });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
