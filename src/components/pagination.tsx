import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Page links for a server-rendered list.
 *
 * Every list in the studio previously took a fixed `limit` and simply stopped —
 * an instructor with 60 students saw 40 of them and nothing said so. Truncation
 * that looks identical to completeness is worse than an error, because the
 * missing rows are invisible until someone is owed money.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  params,
  className,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  /** Current filters, carried across so paging doesn't drop them. */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  function href(target: number): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v) qs.set(k, v);
    }
    if (target > 1) qs.set("page", String(target));
    const query = qs.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  const prev = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <PageLink
        href={href(prev)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </PageLink>

      <span className="text-sm tabular-nums text-ink-soft">
        Page {page} of {pageCount}
      </span>

      <PageLink
        href={href(next)}
        disabled={page >= pageCount}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
  ...rest
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
} & React.ComponentProps<"a">) {
  const classes = cn(
    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
    disabled
      ? "cursor-not-allowed border-line bg-paper text-ink-faint"
      : "border-line-strong bg-surface text-ink hover:border-brand-300 hover:text-brand-700",
  );

  if (disabled) {
    return (
      <span aria-disabled className={classes} {...rest}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/** Clamps a `?page=` value and works out the SQL offset. */
export function readPage(
  raw: string | undefined,
  total: number,
  perPage: number,
): { page: number; pageCount: number; offset: number } {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const parsed = Number(raw);
  const page = Number.isFinite(parsed)
    ? Math.min(pageCount, Math.max(1, Math.floor(parsed)))
    : 1;
  return { page, pageCount, offset: (page - 1) * perPage };
}
