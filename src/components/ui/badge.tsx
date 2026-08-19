import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-brand-50 text-brand-800 border border-brand-100",
        brand: "bg-brand-600 text-white",
        soft: "bg-[var(--color-line)]/60 text-ink-soft",
        success: "bg-brand-100 text-brand-800",
        warning: "bg-accent-100 text-accent-700",
        danger: "bg-danger-100 text-danger-700",
        info: "bg-info-100 text-info-700",
        outline: "border border-line-strong text-ink-soft",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Status pill for a class session. */
export function SessionStatusBadge({ status }: { status: string }) {
  if (status === "LIVE")
    return (
      <Badge tone="danger" className="uppercase tracking-wide">
        <span className="h-1.5 w-1.5 rounded-full bg-danger-500 animate-pulse-dot" />
        Live
      </Badge>
    );
  if (status === "CANCELLED") return <Badge tone="soft">Cancelled</Badge>;
  if (status === "COMPLETED") return <Badge tone="soft">Completed</Badge>;
  return <Badge tone="neutral">Scheduled</Badge>;
}
