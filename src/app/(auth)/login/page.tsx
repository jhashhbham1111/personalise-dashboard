import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Sign in to see your classes and bookings.
      </p>

      <LoginForm next={next} />

      <p className="mt-6 text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      <DemoAccounts />
    </div>
  );
}

/**
 * Visible only in development — a one-click way into each role without having to
 * remember which seeded account is which.
 */
function DemoAccounts() {
  if (process.env.NODE_ENV === "production") return null;
  const accounts = [
    ["student@personalise.app", "Student"],
    ["ananya@personalise.app", "Instructor"],
    ["admin@personalise.app", "Admin"],
  ];
  return (
    <div className="mt-8 rounded-lg border border-dashed border-line-strong bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Demo accounts
      </p>
      <ul className="mt-2 space-y-1 text-xs text-ink-soft">
        {accounts.map(([email, label]) => (
          <li key={email} className="flex justify-between gap-3">
            <span className="font-mono">{email}</span>
            <span className="text-ink-faint">{label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">
        Password for all: <span className="font-mono">password123</span>
      </p>
    </div>
  );
}
