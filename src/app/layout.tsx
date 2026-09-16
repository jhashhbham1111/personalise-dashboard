import type { Metadata, Viewport } from "next";

import { env } from "@/lib/env";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/json-ld";
import { SplashScreen } from "@/components/splash-screen";

import "./globals.css";

export const metadata: Metadata = {
  // Makes every relative og:image and canonical URL in the app resolve against
  // the real origin instead of localhost.
  metadataBase: new URL(env.appUrl),
  // The homepage is the one page that has to carry the brand name *and* the
  // category, because a brand nobody has heard of earns no searches on its
  // own — the category words are what an unfamiliar person actually types.
  title: {
    default:
      "Personalise — Book Online Yoga, Fitness & Music Classes in India",
    template: "%s · Personalise",
  },
  // Deliberately no `alternates.canonical` here. Metadata set on the root
  // layout is inherited by every page that doesn't override it, so a canonical
  // of "/" would tell Google that /contact, /classes and everything else are
  // duplicates of the homepage — and they'd drop out of the index. Canonicals
  // belong on the individual pages, which is where they're set.
  description:
    "Book live and in-person classes with yoga teachers, musicians, dancers and coaches. Schedules, passes, recordings and live classes in one place.",
  applicationName: env.appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // iOS ignores the web manifest entirely and reads these instead.
    capable: true,
    title: env.appName,
    // The status bar text sits over the page, so "default" (dark text) is the
    // readable choice against --color-paper.
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: {
    // Stops iOS turning every class duration and price into a phone-number
    // link, which is how "60 min" ends up blue and tappable.
    telephone: false,
  },
};

export const viewport: Viewport = {
  // --color-brand-600: tints the Android status bar and the task switcher, and
  // must match `theme_color` in the manifest or Chrome flashes between the two
  // on launch.
  themeColor: "#1f6650",
  width: "device-width",
  initialScale: 1,
  // Required for `env(safe-area-inset-*)` to compute to anything but 0 — the
  // live room and the mobile nav both rely on it to clear the notch and the
  // home indicator.
  viewportFit: "cover",
  // Deliberately not locking `maximumScale`/`userScalable`: pinch-zoom is an
  // accessibility affordance, and Play review flags disabling it.
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/*
       * suppressHydrationWarning is on <body> because browser extensions write
       * their own attributes onto it before React hydrates — Grammarly adds
       * data-gr-ext-installed and data-new-gr-c-s-check-loaded, password
       * managers and translators do the same. React then compares the server's
       * HTML against a DOM a third party has already edited and reports a
       * mismatch the app cannot cause and cannot fix.
       *
       * The suppression is attribute-level and applies to this element alone:
       * children are still checked normally, so a real hydration bug anywhere
       * inside the app still surfaces.
       */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {/*
          Sitewide identity. Organization lets Google attach the name and logo
          to a result from any page rather than only the homepage, and WebSite
          declares the instructor search, which is what can render a search box
          under a brand result.
        */}
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        {children}
        {/* Last in the body so it never sits between the page and the reader
            in the accessibility tree, and so the real content is what the
            server sends. */}
        <SplashScreen />
      </body>
    </html>
  );
}
