import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Personalise is a full server-rendered Next.js app (auth cookies, a
 * database, API routes) — not something that can be exported as static
 * files and bundled into the app. So the native shell doesn't load a local
 * bundle at all: its WebView points straight at the live deployment.
 *
 * `webDir` still has to point at *something* that exists (Capacitor's CLI
 * requires it even when `server.url` means that folder's contents are never
 * actually loaded), so `ios-shell/` is just an empty placeholder.
 *
 * CAPACITOR_SERVER_URL defaults to localhost for Simulator testing before
 * there's a real deployment. Before shipping to the App Store this MUST
 * point at the production HTTPS URL — App Review will reject (and Apple's
 * App Transport Security will block at runtime on a real device) anything
 * still pointing at localhost or using cleartext http.
 */
const config: CapacitorConfig = {
  appId: "com.maintenancem.personalise",
  appName: "Personalise",
  webDir: "ios-shell",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "http://localhost:3000",
    cleartext: true,
  },
};

export default config;
