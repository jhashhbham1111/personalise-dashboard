"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

/**
 * The mobile half of the site nav.
 *
 * The public links live in a `hidden md:flex` nav in the header, which left
 * phone visitors with no navigation at all above the footer — and the logo,
 * being three stacked strokes in a rounded square, was the thing people tapped
 * expecting a menu. This is that menu, so the affordance people were already
 * reaching for now exists and does what they expect.
 *
 * Radix Dialog rather than a bare div: it handles focus trapping, restoring
 * focus to the trigger on close, Escape, and scroll locking — all of which a
 * hand-rolled drawer gets wrong in ways that only show up with a keyboard or a
 * screen reader.
 */
export function MobileNav({
  items,
  signedIn = false,
}: {
  items: { href: string; label: string }[];
  /**
   * Whether to offer "Sign in" at the bottom of the sheet.
   *
   * The header shows "Sign in" and "Get started" side by side, which is 22px
   * wider than a 390px phone — the whole page scrolled sideways because of it.
   * "Sign in" is the one that moves in here, because "Get started" is what a
   * first-time visitor is looking for and someone who already has an account
   * knows to go looking for the way in.
   */
  signedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] md:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-4 shadow-xl md:hidden"
          aria-describedby={undefined}
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              Browse
            </Dialog.Title>
            <Dialog.Close
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-brand-50 hover:text-ink"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <nav className="flex flex-col">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {signedIn ? null : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-auto rounded-lg border border-line px-3 py-3 text-center text-base font-medium text-ink transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              Sign in
            </Link>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
