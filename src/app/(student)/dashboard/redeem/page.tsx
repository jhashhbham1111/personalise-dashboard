import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page";
import { RedeemForm } from "./redeem-form";

export const metadata: Metadata = { title: "Redeem a pass code" };

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await requireUser("/dashboard/redeem");
  // A code can arrive in the URL, so an instructor can send a link rather than
  // asking someone to retype eight characters on a phone.
  const { code } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title="Redeem a pass code"
        description="Paid your instructor? Enter the code they gave you and your pass activates straight away."
      />
      <RedeemForm initialCode={code} />
    </div>
  );
}
