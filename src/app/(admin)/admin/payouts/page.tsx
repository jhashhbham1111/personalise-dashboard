import Link from "next/link";
import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { payoutReport } from "@/lib/admin";
import { env } from "@/lib/env";
import { addDays } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payouts · Admin" };

const PERIODS = {
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  all: { label: "All time", days: null },
} as const;

type PeriodKey = keyof typeof PERIODS;

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const key: PeriodKey = period === "30d" || period === "90d" ? period : "all";
  const days = PERIODS[key].days;
  const since = days ? addDays(new Date(), -days) : undefined;

  const rows = await payoutReport(since);
  const withEarnings = rows.filter(
    (r) => r.onlinePaise > 0 || r.offlinePaise > 0 || r.pendingPaise > 0,
  );

  const totals = withEarnings.reduce(
    (acc, r) => ({
      online: acc.online + r.onlinePaise,
      offline: acc.offline + r.offlinePaise,
      fee: acc.fee + r.feePaise,
      net: acc.net + r.netPaise,
    }),
    { online: 0, offline: 0, fee: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description={`What each instructor is owed from online payments, after the ${env.platformFeePercent}% platform fee.`}
      />

      <nav className="flex gap-1" aria-label="Period">
        {(Object.keys(PERIODS) as PeriodKey[]).map((p) => (
          <Link
            key={p}
            href={`/admin/payouts?period=${p}`}
            aria-current={p === key ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              p === key
                ? "bg-brand-600 text-white"
                : "border border-line-strong bg-surface text-ink-soft hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {PERIODS[p].label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Collected online"
          value={formatMoney(totals.online)}
          tone="brand"
        />
        <StatTile
          label={`Platform fee (${env.platformFeePercent}%)`}
          value={formatMoney(totals.fee)}
        />
        <StatTile
          label="Owed to instructors"
          value={formatMoney(totals.net)}
          tone={totals.net > 0 ? "accent" : "default"}
        />
      </div>

      {withEarnings.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Nothing to pay out"
          description="No payments landed in this period."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left">
                  <Th>Instructor</Th>
                  <Th className="text-right">Payments</Th>
                  <Th className="text-right">Online</Th>
                  <Th className="text-right">Fee</Th>
                  <Th className="text-right">Net payable</Th>
                  <Th className="text-right">Cash collected</Th>
                  <Th className="text-right">Unpaid</Th>
                </tr>
              </thead>
              <tbody>
                {withEarnings.map((r) => (
                  <tr key={r.instructorId} className="border-b border-line last:border-0">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/i/${r.slug}`}
                          className="font-medium text-ink hover:text-brand-700"
                        >
                          {r.name}
                        </Link>
                        {r.isSuspended ? <Badge tone="danger">Suspended</Badge> : null}
                      </div>
                      <p className="text-xs text-ink-faint">{r.email}</p>
                    </Td>
                    <Td className="text-right tabular-nums text-ink-soft">
                      {r.paymentCount}
                    </Td>
                    <Td className="text-right tabular-nums text-ink">
                      {formatMoney(r.onlinePaise)}
                    </Td>
                    <Td className="text-right tabular-nums text-ink-soft">
                      −{formatMoney(r.feePaise)}
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-ink">
                      {formatMoney(r.netPaise)}
                    </Td>
                    <Td className="text-right tabular-nums text-ink-faint">
                      {r.offlinePaise > 0 ? formatMoney(r.offlinePaise) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {r.pendingPaise > 0 ? (
                        <span className="text-accent-700">
                          {formatMoney(r.pendingPaise)}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-1.5 text-xs text-ink-faint">
        <p>
          <strong>Cash collected</strong> is money students paid the instructor
          directly and the instructor recorded themselves. It never passed through
          the platform, so it isn&apos;t part of a payout — it&apos;s shown so the
          numbers here reconcile with what the instructor sees on their own fees
          page.
        </p>
        <p>
          <strong>Unpaid</strong> is enrolments where checkout was started but the
          payment never completed. Nothing is owed on it.
        </p>
        <p>
          This is a report, not a settlement system — no money moves from this
          screen. Set the platform&apos;s cut with{" "}
          <code className="font-mono">PLATFORM_FEE_PERCENT</code>. Actually paying
          instructors automatically would mean Razorpay Route with per-instructor
          KYC, which isn&apos;t built.
        </p>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
