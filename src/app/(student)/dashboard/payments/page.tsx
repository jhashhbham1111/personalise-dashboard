import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";

import { db, instructorProfiles, payments, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";

export const metadata: Metadata = { title: "Payments" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "soft"> = {
  PAID: "success",
  PENDING: "warning",
  CREATED: "warning",
  FAILED: "danger",
  REFUNDED: "soft",
};

export default async function PaymentsPage() {
  const user = await requireUser("/dashboard/payments");

  const rows = await db
    .select({
      payment: payments,
      instructorName: users.name,
      instructorSlug: instructorProfiles.slug,
    })
    .from(payments)
    .innerJoin(
      instructorProfiles,
      eq(instructorProfiles.id, payments.instructorId),
    )
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(eq(payments.studentId, user.id))
    .orderBy(desc(payments.createdAt));

  const totalPaid = rows
    .filter((r) => r.payment.status === "PAID")
    .reduce((sum, r) => sum + r.payment.amountPaise, 0);
  const outstanding = rows
    .filter((r) => ["PENDING", "CREATED"].includes(r.payment.status))
    .reduce((sum, r) => sum + r.payment.amountPaise, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Every pass you've bought, with its invoice number."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total paid" value={formatMoney(totalPaid)} tone="brand" />
        <StatTile
          label="Awaiting payment"
          value={formatMoney(outstanding)}
          tone={outstanding > 0 ? "accent" : "default"}
        />
        <StatTile label="Transactions" value={rows.length} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No payments yet"
          description="Once you buy a pass it'll show up here with its invoice."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left">
                  <Th>Invoice</Th>
                  <Th>What for</Th>
                  <Th>Instructor</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ payment, instructorName }) => (
                  <tr key={payment.id} className="border-b border-line last:border-0">
                    <Td className="font-mono text-xs text-ink-faint">
                      {payment.invoiceNo}
                    </Td>
                    <Td className="max-w-xs truncate text-ink">
                      {payment.description}
                    </Td>
                    <Td className="text-ink-soft">{instructorName}</Td>
                    <Td className="whitespace-nowrap text-ink-soft">
                      {formatDateTime(payment.createdAt, user.timezone)}
                    </Td>
                    <Td className="text-ink-soft">{payment.method}</Td>
                    <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink">
                      {formatMoney(payment.amountPaise, payment.currency)}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[payment.status] ?? "soft"}>
                        {payment.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint ${className ?? ""}`}
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
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
