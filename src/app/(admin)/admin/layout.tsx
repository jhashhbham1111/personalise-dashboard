import { requireAdmin } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { AdminTabs } from "./admin-tabs";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/instructors", label: "Instructors" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/diagnostics", label: "Diagnostics" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <SiteHeader homeHref="/admin" showPublicNav={false} />

      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Platform admin
          </p>
          <AdminTabs tabs={TABS} />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
