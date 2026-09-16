import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { env } from "@/lib/env";

/**
 * Crawl rules.
 *
 * Two jobs. The first is the ordinary one: keep crawlers out of everything
 * behind a login, so Google doesn't spend its budget on pages that only ever
 * render a redirect to /login, and so a signed-out crawler's view of the app
 * isn't mistaken for thin content.
 *
 * The second matters more here. This app answers on more than one hostname —
 * the custom domain, the project's `.vercel.app` alias, and a fresh URL for
 * every preview deployment. To Google those are separate sites serving
 * identical pages, which splits ranking signals between copies of the same
 * content and can leave the wrong hostname as the one people find. Canonical
 * tags say which URL is preferred; this refuses the others outright, which is
 * the stronger signal and the one that also keeps unfinished preview builds
 * out of the index entirely.
 */

// Reads the request host, so it cannot be statically cached.
export const dynamic = "force-dynamic";

/** Paths that only ever make sense to someone signed in. */
const PRIVATE_PATHS = [
  "/admin",
  "/studio",
  "/dashboard",
  "/account",
  "/onboarding",
  "/checkout",
  "/live",
  "/api/",
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const canonicalHost = new URL(env.appUrl).host;
  const requestHost = (await headers()).get("host") ?? canonicalHost;

  // Any hostname that isn't the canonical one is a duplicate of this site.
  // Preview deployments and the .vercel.app alias land here.
  if (requestHost !== canonicalHost) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: PRIVATE_PATHS,
    },
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
