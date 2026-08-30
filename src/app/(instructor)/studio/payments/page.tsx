import type { Metadata } from "next";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Receipt } from "lucide-react";

import { db, offerings, payments, pricingPlans, users } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { formatDateTime, toDateInput } from "@/lib/time";
import { formatMoney, paiseToRupees } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import { Pagination, readPage } from "@/components/pagination";
import { OfflinePaymentDialog } from "./offline-payment-dialog";
import { PaymentRowActions } from "./payment-row-actions";

export const metadata: Metadata = { title: "Earnings" };

const PER_PAGE = 40;

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "soft"> = {
  PAID: "success",
  PENDING: "warning",
  CREATED: "warning",
  FAILED: "danger",
  REFUNDED: "soft",
};

export default async function StudioPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const user = await requireInstructor();
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const mine = eq(payments.instructorId, user.instructorProfileId);

  /**
   * Totals are computed in SQL over every row, not over the page being shown.
   * Summing the visible page would quietly under-report an instructor's income
   * the moment they had more than one page of payments.
   */
  const [[totals], [{ total }]] = await Promise.all([
    db
      .select({
        paidAllTime: sql<number>`coalesce(sum(case when ${payments.status} = 'PAID' then ${payments.amountPaise} else 0 end), 0)`,
        paidThisMonth: sql<number>`coalesce(sum(case when ${payments.status} = 'PAID' and ${payments.paidAt} >= ${monthStart.getTime()} then ${payments.amountPaise} else 0 end), 0)`,
        owed: sql<number>`coalesce(sum(case when ${payments.status} in ('PENDING','CREATED') then ${payments.amountPaise} else 0 end), 0)`,
        owedCount: sql<number>`sum(case when ${payments.status} in ('PENDING','CREATED') then 1 else 0 end)`,
      })
      .from(payments)
      .where(mine),
    db
      .select({ total: sql<number>`count(*)` })
      .from(payments)
      .where(mine),
  ]);

  const { page, pageCount, offset } = readPage(pageParam, Number(total), PER_PAGE);

  const [rows, planOptions, offeringOptions] = await Promise.all([
    db
      .select({
        payment: payments,
        studentName: users.name,
        studentAvatar: users.avatarUrl,
      })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.studentId))
      .where(mine)
      .orderBy(desc(payments.createdAt))
      .limit(PER_PAGE)
      .offset(offset),

    // Plans the instructor can log an offline payment against.
    db
      .select({
        id: pricingPlans.id,
        name: pricingPlans.name,
        amountPaise: pricingPlans.amountPaise,
        offeringId: offerings.id,
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

    db
      .select({ id: offerings.id, title: offerings.title })
      .from(offerings)
      .where(
        and(
          eq(offerings.instructorId, user.instructorProfileId),
          eq(offerings.isActive, true),
        ),
      )
      .orderBy(asc(offerings.title)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        description="Everything students have paid you, and everything still owing."
        actions={
          offeringOptions.length > 0 ? (
            <OfflinePaymentDialog
              plans={planOptions.map((p) => ({
                id: p.id,
                label: `${p.offeringTitle} — ${p.name}`,
                amountRupees: paiseToRupees(p.amountPaise),
                offeringId: p.offeringId,
              }))}
              offerings={offeringOptions}
            />
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="This month"
          value={formatMoney(Number(totals.paidThisMonth))}
          tone="brand"
        />
        <StatTile label="All time" value={formatMoney(Number(totals.paidAllTime))} />
        <StatTile
          label="Pending payment"
          value={formatMoney(Number(totals.owed))}
          sub={
            Number(totals.owedCount) > 0
              ? `${Number(totals.owedCount)} unpaid`
              : undefined
          }
          tone={Number(totals.owed) > 0 ? "accent" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No payments yet"
          description="When someone buys a pass it lands here with its invoice number. You can also record cash payments yourself."
        />
      ) : (
        <>
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
                    <Th className="text-right">Edit</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ payment, studentName, studentAvatar }) => (
                    <tr
                      key={payment.id}
                      className="border-b border-line last:border-0"
                    >
                      <Td className="font-mono text-xs text-ink-faint">
                        {payment.invoiceNo}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={studentName}
                            src={studentAvatar}
                            size="sm"
                          />
                          <span className="truncate text-ink">{studentName}</span>
                        </div>
                      </Td>
                      <Td className="max-w-xs truncate text-ink-soft">
                        {payment.description}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-soft">
                        {formatDateTime(
                          payment.paidAt ?? payment.createdAt,
                          user.timezone,
                        )}
                      </Td>
                      <Td>
                        <Badge
                          tone={payment.method === "OFFLINE" ? "soft" : "neutral"}
                        >
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
                      <Td className="text-right">
                        {payment.method === "OFFLINE" ? (
                          <PaymentRowActions
                            row={{
                              id: payment.id,
                              invoiceNo: payment.invoiceNo,
                              description: payment.description,
                              amountRupees: paiseToRupees(payment.amountPaise),
                              paidAtDate: toDateInput(
                                payment.paidAt ?? payment.createdAt,
                                user.timezone,
                              ),
                              studentName,
                              isVoided: payment.status === "REFUNDED",
                            }}
                          />
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            page={page}
            pageCount={pageCount}
            basePath="/studio/payments"
          />
        </>
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
