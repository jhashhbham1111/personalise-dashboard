import * as React from "react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "brand" | "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border p-4",
        tone === "brand"
          ? "border-brand-200 bg-brand-50"
          : tone === "accent"
            ? "border-accent-300 bg-accent-100"
            : "border-line bg-surface",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info-500/30 bg-info-100 text-info-700",
    success: "border-brand-300 bg-brand-50 text-brand-800",
    warning: "border-accent-300 bg-accent-100 text-accent-700",
    danger: "border-danger-500/30 bg-danger-100 text-danger-700",
  } as const;
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-sm",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
