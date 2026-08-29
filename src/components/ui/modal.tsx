"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Uncontrolled modal: pass the opener as `trigger`. Used for confirm-and-act
 * flows (cancel a class, record an offline payment) where a full page would be
 * overkill.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  className,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            // Capped height + a scrollable body, because Radix locks scrolling
            // on the page behind an open dialog: a form taller than the screen
            // would otherwise overflow off both ends with no way to reach its
            // buttons. That's invisible on a laptop and fatal on a phone.
            // dvh, not vh — on mobile browsers vh counts the area behind the
            // address bar, so the bottom of the dialog hides underneath it.
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-xl animate-fade-up",
            className,
          )}
        >
          {/* Header stays put while the body scrolls, so the title and the
              close button never scroll out of reach. */}
          <div className="shrink-0 px-5 pb-4 pr-12 pt-5">
            <Dialog.Title className="text-lg font-semibold text-ink">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-ink-soft">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close
            className="absolute right-4 top-4 rounded-md p-1 text-ink-faint hover:bg-brand-50 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
          {/* min-h-0 is what actually lets this shrink inside the flex column —
              without it a flex item refuses to go below its content height and
              overflow-y-auto never engages. overscroll-contain stops a scroll
              that reaches the end here from grabbing the page behind. */}
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
