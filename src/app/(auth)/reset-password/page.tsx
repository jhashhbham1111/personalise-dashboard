import Link from "next/link";
import type { Metadata } from "next";

import { isResetTokenValid } from "@/lib/password-reset";
import { Alert } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Checked before rendering the form so an expired link says so immediately,
  // rather than after someone has typed a new password twice.
  const valid = token ? await isResetTokenValid(token) : false;

  if (!valid) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          This link doesn&rsquo;t work
        </h1>
        <Alert tone="danger" className="mt-5">
          Reset links expire after an hour and can only be used once.
        </Alert>
        <ButtonLink href="/forgot-password" className="mt-5" block size="lg">
          Send a new link
        </ButtonLink>
        <p className="mt-6 text-sm text-ink-soft">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Pick something you haven&rsquo;t used elsewhere.
      </p>

      <ResetPasswordForm token={token!} />
    </div>
  );
}
