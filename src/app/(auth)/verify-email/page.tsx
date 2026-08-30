import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { requireUserPendingVerification, homePathForRole } from "@/lib/auth";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "Confirm your email" };

/**
 * The one screen an unverified account can reach.
 *
 * Everything else redirects here (see requireUser), so this page is both the
 * block and the way out of it — which is why it carries the resend and the
 * change-address escape hatches rather than only a code box.
 */
export default async function VerifyEmailPage() {
  const user = await requireUserPendingVerification();
  if (user.emailVerifiedAt) redirect(homePathForRole(user.role));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Confirm your email</h1>
      <p className="mt-1 text-sm text-ink-soft">
        We sent a 6-digit code to{" "}
        <span className="font-medium text-ink">{user.email}</span>. Enter it
        below to finish setting up your account.
      </p>

      <VerifyEmailForm email={user.email} />
    </div>
  );
}
