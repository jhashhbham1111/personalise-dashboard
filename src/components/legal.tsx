import * as React from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { LEGAL } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";

/**
 * Shared chrome and prose styling for /legal/* and /contact.
 *
 * Four documents that disagree with each other about their own last-updated
 * date, heading sizes or footer links look exactly as unmaintained as they
 * are — and these are the pages a Razorpay reviewer and an annoyed customer
 * both read closely. One component, four pages.
 */

/** The four pages a payment gateway wants reachable from each other. */
const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/refunds", label: "Refunds and cancellations" },
  { href: "/contact", label: "Contact" },
];

function isUnfilled(value: string): boolean {
  return value.trimStart().startsWith("TODO:");
}

/**
 * Renders one of the {@link LEGAL} identity fields — or, while it is still a
 * placeholder, an unmissable amber marker in its place.
 *
 * Shipping a policy with a blank where the company name goes is a very easy
 * mistake to make, because everything around the blank is finished prose. A
 * badge mid-sentence is not something anyone reads past.
 */
export function Fill({ value, label }: { value: string; label: string }) {
  if (!isUnfilled(value)) return <>{value}</>;
  return (
    <Badge tone="warning" className="align-baseline">
      <TriangleAlert className="h-3 w-3 shrink-0" />
      {label} — needs filling in
    </Badge>
  );
}

/**
 * The support email as a clickable mailto — but only once it is real. A
 * `mailto:TODO:...` link opens the visitor's mail client addressed to nothing,
 * which is worse than showing them the page isn't finished.
 */
export function SupportEmail() {
  if (isUnfilled(LEGAL.supportEmail))
    return <Fill value={LEGAL.supportEmail} label="Support email" />;
  return (
    <a
      href={`mailto:${LEGAL.supportEmail}`}
      className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
    >
      {LEGAL.supportEmail}
    </a>
  );
}

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <PageHeader title={title} description={summary} />

      <p className="mt-4 text-sm text-ink-faint">
        Last updated:{" "}
        <Fill value={LEGAL.lastUpdated} label="Last-updated date" />
      </p>

      <div className="mt-10 space-y-10">{children}</div>

      <LegalFooterNav />
    </div>
  );
}

/**
 * Cross-links between the four documents.
 *
 * The site footer doesn't carry them, and a gateway reviewer checking that all
 * four are reachable will start from whichever one they were sent.
 */
export function LegalFooterNav({ className }: { className?: string }) {
  return (
    <nav className={cn("mt-14 border-t border-line pt-6", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        The other documents
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-ink-soft hover:text-brand-700"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    // scroll-mt clears the sticky site header when someone follows a #link.
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list. Preflight strips list markers, so they're added back here. */
export function LegalList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "ml-5 list-disc space-y-2 marker:text-ink-faint",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/** Emphasis inside legal prose — darker than the surrounding body text. */
export function Point({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

/** An in-text link. Underlined, because prose links need to look like links. */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
    >
      {children}
    </Link>
  );
}
