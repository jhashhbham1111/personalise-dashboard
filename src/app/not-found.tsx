import type { Metadata } from "next";
import { Compass } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The 404 anyone lands on from a stale link — a class that was cancelled, a
 * video made private, an instructor no longer listed. The default Next.js page
 * is unstyled and offers no way back, which is a poor ending for a link someone
 * was sent in good faith.
 *
 * Deliberately renders no header or footer: this boundary composes *inside*
 * whichever route group's layout the missing page belonged to, and those
 * already supply the site chrome. Adding it here would draw it twice.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Compass className="h-7 w-7" />
        </span>

        <h1 className="mt-5 text-2xl font-semibold text-ink">
          We couldn&rsquo;t find that page
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          The link may be out of date — a class that finished, or a page an
          instructor has since taken down.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/classes">Browse classes</ButtonLink>
          <ButtonLink href="/instructors" variant="secondary">
            Find an instructor
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
