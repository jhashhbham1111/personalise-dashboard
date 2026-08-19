import type { Metadata } from "next";
import { and, asc, desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";

import { db, enrollments, offerings, payments, pricingPlans, users } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import { formatMoney, paiseToRupees } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { OfflinePaymentDialog } from "./offline-payment-dialog";

export const metadata: Metadata = { title: "Fees" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "soft"> = {
  PAID: "success",
  PENDING: "warning",
  CREATED: "warning",
  FAILED: "danger",
  REFUNDED: "soft",
};

export default async function StudioPaymentsPage() {
  const user = await requireInstructor();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [rows, planOptions, studentOptions] = await Promise.all([
    db
      .select({
        payment: payments,
        studentName: users.name,
        studentAvatar: users.avatarUrl,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.studentId))
      .where(eq(payments.instructorId, user.instructorProfileId))
      .orderBy(desc(payments.createdAt))
      .limit(200),

    // Plans the instructor can log an offline payment against.
    db
      .select({
        id: pricingPlans.id,
        name: pricingPlans.name,
        amountPaise: pricingPlans.amountPaise,
        offeringTitle: offerings.title,
      })
      .from(pricingPlans)
      .innerJoin(offerings, eq(offerings.id, pricingPlans.offeringId))
      .where(
        and(
          eq(offerings.instructorId, user.instructorProfileId),
          eq(pricingPlans.isActive, true),
          eq(offerings.isActive, true),
        ),
      )
      .orderBy(asc(offerings.title), asc(pricingPlans.sortOrder)),

    // Autocomplete suggestions only. The dialog takes an email, so an
    // instructor can always enrol someone who has never been their student —
    // which is the common case when collecting cash from a newcomer.
    db
      .selectDistinct({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(eq(enrollments.instructorId, user.instructorProfileId))
      .orderBy(asc(users.name))
      .limit(200),
  ]);

  const paid = rows.filter((r) => r.payment.status === "PAID");
  const outstanding = rows.filter((r) =>
    ["PENDING", "CREATED"].includes(r.payment.status),
  );

  const totalPaid = paid.reduce((s, r) => s + r.payment.amountPaise, 0);
  const thisMonth = paid
    .filter((r) => r.payment.paidAt && r.payment.paidAt >= monthStart)
    .reduce((s, r) => s + r.payment.amountPaise, 0);
  const owed = outstanding.reduce((s, r) => s + r.payment.amountPaise, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees"
        description="Everything students have paid you, and everything still owing."
        actions={
          planOptions.length > 0 ? (
            <OfflinePaymentDialog
              plans={planOptions.map((p) => ({
                id: p.id,
                label: `${p.offeringTitle} — ${p.name}`,
                amountRupees: paiseToRupees(p.amountPaise),
              }))}
              students={studentOptions}
            />
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="This month"
          value={formatMoney(thisMonth)}
          tone="brand"
        />
        <StatTile label="All time" value={formatMoney(totalPaid)} />
        <StatTile
          label="Awaiting payment"
          value={formatMoney(owed)}
          sub={outstanding.length > 0 ? `${outstanding.length} unpaid` : undefined}
          tone={owed > 0 ? "accent" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No payments yet"
          description="When someone buys a pass it lands here with its invoice number. You can also record cash payments yourself."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-paper text-left">
                  <Th>Invoice</Th>
                  <Th>Student</Th>
                  <Th>What for</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ payment, studentName, studentAvatar }) => (
                  <tr key={payment.id} className="border-b border-line last:border-0">
                    <Td className="font-mono text-xs text-ink-faint">
                      {payment.invoiceNo}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={studentName} src={studentAvatar} size="sm" />
                        <span className="truncate text-ink">{studentName}</span>
                      </div>
                    </Td>
                    <Td className="max-w-xs truncate text-ink-soft">
                      {payment.description}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-soft">
                      {formatDateTime(payment.createdAt, user.timezone)}
                    </Td>
                    <Td>
                      <Badge tone={payment.method === "OFFLINE" ? "soft" : "neutral"}>
                        {payment.method === "OFFLINE" ? "Cash" : payment.method}
                      </Badge>
                    </Td>
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

      <p className="text-xs text-ink-faint">
        Payouts to your bank account are handled by your payment provider. This
        page is the record of what students paid.
      </p>
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
