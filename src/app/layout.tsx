import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Personalise — learn from instructors who actually teach",
    template: "%s · Personalise",
  },
  description:
    "Book live and in-person classes with yoga teachers, musicians, dancers and coaches. Schedules, passes, recordings and live classes in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
