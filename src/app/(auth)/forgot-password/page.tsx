import Link from "next/link";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Enter the email on your account and we&rsquo;ll send you a link to
        choose a new password.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
