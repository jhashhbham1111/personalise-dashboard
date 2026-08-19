import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Link href="/" className="inline-flex w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Editorial panel — hidden on small screens where it would just be scroll. */}
      <div className="relative hidden overflow-hidden bg-brand-800 lg:block">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,#7dbca2_0,transparent_45%),radial-gradient(circle_at_80%_70%,#e08c3a_0,transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <blockquote className="max-w-md">
            <p className="text-2xl font-medium leading-snug text-white">
              &ldquo;I used to run my classes across a spreadsheet, three
              WhatsApp groups and a payments app. Now it&rsquo;s one link I send
              people.&rdquo;
            </p>
            <footer className="mt-4 text-sm text-brand-200">
              Ananya Iyer · yoga instructor, Bengaluru
            </footer>
          </blockquote>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/15 pt-6">
            {[
              ["Instructors", "1,200+"],
              ["Classes a month", "18,000"],
              ["Cities", "40"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-brand-200">
                  {label}
                </dt>
                <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
