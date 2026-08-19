"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function ControlButton({
  active = true,
  danger = false,
  label,
  onClick,
  children,
  className,
  disabled,
}: {
  /** false renders the "off" (struck-through / muted) look — e.g. mic off. */
  active?: boolean;
  danger?: boolean;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40",
        danger
          ? "bg-danger-600 text-white hover:bg-danger-700"
          : active
            ? "bg-neutral-800 text-white hover:bg-neutral-700"
            : "bg-white text-neutral-900 hover:bg-neutral-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
