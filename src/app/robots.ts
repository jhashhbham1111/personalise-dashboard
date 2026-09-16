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

  /*
   * Block the deployment hostnames, not "everything that isn't canonical".
   *
   * The stricter rule is tempting and wrong. APP_URL is the only thing that
   * decides `canonicalHost`, and when it is unset `env.appUrl` falls back to
   * Vercel's own production domain — so on a deployment where someone forgot
   * to set it, the real custom domain would fail the comparison and this file
   * would answer `Disallow: /` to Google for the live site. A missing
   * environment variable must not be able to deindex the whole business, and
   * the failure would be silent for as long as it took someone to think of
   * reading robots.txt.
   *
   * Preview builds and the project alias always answer on *.vercel.app, so
   * matching that suffix catches every case this needs to catch, and a
   * misconfigured APP_URL degrades to "canonical tags point at the wrong
   * domain" — bad, but recoverable, and visible in Search Console.
   */
  const isDeploymentHost = requestHost.endsWith(".vercel.app");

  if (isDeploymentHost && requestHost !== canonicalHost) {
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
