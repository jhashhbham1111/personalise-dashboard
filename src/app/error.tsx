"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";

/**
 * Catches a thrown render or data error anywhere under the app.
 *
 * Without this every failure — a database blip, a bad query — showed Next's
 * raw unstyled error screen with a stack trace and no way back, which reads to
 * a real user as "this site is broken" rather than "something went wrong,
 * try again".
 *
 * Renders no header or footer for the same reason not-found.tsx doesn't: this
 * composes inside the route group's layout, which already supplies chrome.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the host's runtime logs, with the digest that ties this
    // render back to the server-side stack trace.
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-100 text-danger-700">
          <AlertTriangle className="h-7 w-7" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          That&rsquo;s on us, not you. Try again — and if it keeps happening,
          let your instructor know.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Go home
          </ButtonLink>
        </div>

        {error.digest ? (
          <p className="mt-6 text-xs text-ink-faint">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
