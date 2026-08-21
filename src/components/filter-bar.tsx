"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { cn } from "@/lib/utils";
import { Select } from "./ui/input";

/**
 * Filters submit as a plain GET form, so the URL always describes the current
 * view — shareable, bookmarkable, and back-button correct. The selects
 * auto-submit; the text input submits on Enter.
 */
export function FilterBar({
  basePath,
  children,
  className,
}: {
  basePath: string;
  children: React.ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={basePath}
      method="get"
      className={cn("flex flex-wrap items-center gap-2", className)}
      onChange={(e) => {
        // Selects apply immediately; typing in a text field should not.
        if ((e.target as HTMLElement).tagName === "SELECT") {
          formRef.current?.requestSubmit();
        }
      }}
    >
      {children}
      <button type="submit" className="sr-only">
        Apply filters
      </button>
    </form>
  );
}

export function FilterSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <Select
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      className="w-auto min-w-36"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/** A date input that applies as soon as a date is picked. */
export function FilterDate({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <input
      type="date"
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn(
        "h-10 w-auto min-w-40 rounded-lg border border-line-strong bg-surface px-3",
        "text-sm text-ink transition-colors",
        "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
      )}
    />
  );
}

/** Single-select pills that read and write one query param. */
export function FilterChips({
  basePath,
  param,
  current,
  options,
  carry,
  className,
}: {
  basePath: string;
  param: string;
  current?: string;
  options: readonly string[];
  carry?: Record<string, string | undefined>;
  className?: string;
}) {
  const router = useRouter();

  function hrefFor(value?: string) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(carry ?? {})) if (v) sp.set(k, v);
    if (value) sp.set(param, value);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  void router;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <Chip href={hrefFor()} active={!current}>
        All
      </Chip>
      {options.map((o) => (
        <Chip key={o} href={hrefFor(o)} active={current === o}>
          {o}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-brand-500 bg-brand-600 text-white"
          : "border-line-strong bg-surface text-ink-soft hover:border-brand-300 hover:text-brand-700",
      )}
    >
      {children}
    </Link>
  );
}
