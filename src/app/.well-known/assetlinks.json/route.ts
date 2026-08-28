import { env } from "@/lib/env";

/**
 * Digital Asset Links — the handshake that makes the Play Store build a
 * Trusted Web Activity rather than a Chrome tab with a URL bar stuck to the
 * top of it.
 *
 * Android fetches https://<domain>/.well-known/assetlinks.json when the app
 * launches and only hides the browser chrome if the signing certificate of the
 * installed APK appears in this list. Get it wrong and the app still works —
 * it just looks like a browser, which is exactly the thing Play review
 * rejects.
 *
 * Served from a route rather than `public/` on purpose: the fingerprint isn't
 * known until Bubblewrap has generated a signing key, and it differs between
 * a local build and Play App Signing. Both go in `ANDROID_SHA256_FINGERPRINTS`
 * as a comma-separated list — the file is allowed to name several
 * certificates, and it needs to during a key rotation.
 *
 * Verify after deploying:
 *   curl https://personalise-dashboard.vercel.app/.well-known/assetlinks.json
 *   https://developers.google.com/digital-asset-links/tools/generator
 */

// Static: nothing here depends on the request, and Android caches it hard
// anyway. Env changes require a redeploy, which is the same as any other
// config change here.
export const dynamic = "force-static";

export function GET() {
  const { packageName, sha256Fingerprints } = env.android;

  // Before the Android package exists, answer honestly rather than serving a
  // statement with empty fields — a malformed assetlinks.json is harder to
  // debug than a missing one, because the verifier reports it as "no matching
  // statement" either way.
  if (!packageName || sha256Fingerprints.length === 0) {
    return Response.json(
      {
        error: "not_configured",
        detail:
          "Set ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINTS to publish a Digital Asset Links statement.",
      },
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: sha256Fingerprints,
      },
    },
  ];

  return Response.json(statements, {
    headers: {
      // Android insists on this exact type; Response.json already sets it, but
      // being explicit here documents the requirement.
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
