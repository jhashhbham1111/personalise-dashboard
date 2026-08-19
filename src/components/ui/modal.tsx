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
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-xl animate-fade-up",
            className,
          )}
        >
          <div className="mb-4 pr-8">
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
