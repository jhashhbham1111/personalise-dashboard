import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Ticket } from "lucide-react";

import { db, offerings, pricingPlans } from "@/db";
import { requireInstructor } from "@/lib/auth";
import { listPassCodes } from "@/lib/pass-codes";
import { formatPassCode } from "@/lib/pass-codes-format";
import { formatDate } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/page";
import {
  CopyCodeButton,
  GenerateCodesDialog,
  RevokeCodeButton,
} from "./code-generator";

export const metadata: Metadata = { title: "Pass codes" };

/**
 * Pass codes exist so an instructor with a hundred students doesn't have to
 * open the app a hundred times a month. They hand over a code when someone
 * pays; the student activates their own pass.
 */
export default async function PassCodesPage() {
  const user = await requireInstructor();

  const [codes, planRows] = await Promise.all([
    listPassCodes(user.instructorProfileId),
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
  ]);

  const unused = codes.filter((c) => c.status === "ACTIVE");
  const redeemed = codes.filter((c) => c.status === "REDEEMED");
  const collected = redeemed.reduce((s, c) => s + c.amountPaise, 0);

  const planOptions = planRows.map((p) => ({
    id: p.id,
    label: `${p.offeringTitle} — ${p.name} · ${formatMoney(p.amountPaise)}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pass codes"
        description="Hand a code to each student when they pay you. They redeem it themselves and their pass activates — no admin from you."
        actions={
          planOptions.length > 0 ? (
            <GenerateCodesDialog plans={planOptions} />
          ) : undefined
        }
      />

      {planOptions.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-8 w-8" />}
          title="Add a class with a price first"
          description="A pass code has to be worth something — create a class and give it at least one pass, then come back."
          action={<ButtonLink href="/studio/offerings/new">Add a class</ButtonLink>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Unused codes" value={String(unused.length)} tone="brand" />
            <StatTile label="Redeemed" value={String(redeemed.length)} />
            <StatTile label="Collected" value={formatMoney(collected)} />
          </div>

          <Card className="border-brand-200 bg-brand-50 p-4">
            <p className="text-sm text-ink">
              <span className="font-medium">How to use these.</span> Print or
              message a code to a student once they&rsquo;ve paid you. They sign
              in, open{" "}
              <span className="font-mono text-xs">Dashboard → Redeem a code</span>
              , and their pass is live straight away.
            </p>
          </Card>

          {codes.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-8 w-8" />}
              title="No codes yet"
              description="Create a batch and hand them out as students pay you."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left">
                      <Th>Code</Th>
                      <Th>Pass</Th>
                      <Th className="text-right">Value</Th>
                      <Th>Status</Th>
                      <Th>Used by</Th>
                      <Th>Expires</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <Td>
                          <div className="flex items-center gap-1">
                            <span
                              className={
                                c.status === "ACTIVE"
                                  ? "font-mono text-sm font-semibold tracking-wider text-ink"
                                  : "font-mono text-sm tracking-wider text-ink-faint line-through"
                              }
                            >
                              {formatPassCode(c.code)}
                            </span>
                            {c.status === "ACTIVE" ? (
                              <CopyCodeButton code={c.code} />
                            ) : null}
                          </div>
                        </Td>
                        <Td className="max-w-xs truncate text-ink-soft">
                          {c.label}
                        </Td>
                        <Td className="whitespace-nowrap text-right tabular-nums text-ink">
                          {formatMoney(c.amountPaise)}
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              c.status === "ACTIVE"
                                ? "success"
                                : c.status === "REDEEMED"
                                  ? "soft"
                                  : "danger"
                            }
                          >
                            {c.status.toLowerCase()}
                          </Badge>
                        </Td>
                        <Td className="text-ink-soft">
                          {c.redeemerName ? (
                            <span>
                              {c.redeemerName}
                              {c.redeemedAt ? (
                                <span className="block text-xs text-ink-faint">
                                  {formatDate(c.redeemedAt, user.timezone)}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-soft">
                          {c.expiresAt
                            ? formatDate(c.expiresAt, user.timezone)
                            : "never"}
                        </Td>
                        <Td className="text-right">
                          {c.status === "ACTIVE" ? (
                            <RevokeCodeButton codeId={c.id} code={c.code} />
                          ) : null}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
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
