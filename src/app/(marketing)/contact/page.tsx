import type { Metadata } from "next";
import { Mail, MapPin, Phone, User } from "lucide-react";

import { LEGAL } from "@/lib/legal";
import {
  Fill,
  LegalFooterNav,
  LegalLink,
  LegalList,
  LegalSection,
  Point,
  SupportEmail,
} from "@/components/legal";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach Personalise, and when your instructor is the right person to ask instead.",
};

/**
 * Half of what lands in a support inbox belongs to an instructor, not to us —
 * a missing pass, a refund, a class that moved. Sending those to the right
 * place on this page is worth more than any reply we could write.
 */
const ROUTES: {
  title: string;
  who: string;
  body: string;
  href?: string;
  hrefLabel?: string;
}[] = [
  {
    title: "A class, a pass, a payment or a refund",
    who: "Your instructor",
    body: "They ran the class, they took the money, and they are the only person who can put either right. Their contact details are on their profile page — the same page you enrolled from.",
    href: "/instructors",
    hrefLabel: "Find your instructor",
  },
  {
    title: "Signing in, your account, or something visibly broken",
    who: "Us",
    body: "Password resets that never arrive, an email address you can no longer use, a page that errors, a booking the app got wrong.",
  },
  {
    title: "Reporting an instructor, or a safety concern",
    who: "Us",
    body: "Somebody taking money and not teaching, a profile claiming qualifications it does not have, harassment in a class. Tell us and we will look — we can suspend an account.",
  },
  {
    title: "You teach, and want your classes listed",
    who: "Start here",
    body: "Sign up as an instructor, build your profile, and we will verify it before it appears in the directory.",
    href: "/signup?intent=teach",
    hrefLabel: "Start teaching",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Contact"
        description="A real person reads this inbox. Below is how to reach them — and when your instructor is the faster answer."
      />

      <Card className="mt-8 p-5">
        <dl className="space-y-4 text-sm">
          <div className="flex gap-3">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div className="min-w-0">
              <dt className="font-medium text-ink">Operated by</dt>
              <dd className="mt-0.5 text-ink-soft">
                <Fill value={LEGAL.operatorName} label="Operator name" />
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div className="min-w-0">
              <dt className="font-medium text-ink">Email</dt>
              <dd className="mt-0.5 text-ink-soft">
                <SupportEmail />
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div className="min-w-0">
              <dt className="font-medium text-ink">Phone</dt>
              <dd className="mt-0.5 text-ink-soft">
                <Fill value={LEGAL.phone} label="Phone number" />
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            <div className="min-w-0">
              <dt className="font-medium text-ink">Address</dt>
              <dd className="mt-0.5 text-ink-soft">
                <Fill value={LEGAL.address} label="Postal address" />
              </dd>
            </div>
          </div>
        </dl>

        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">
          We aim to reply within <Point>two working days</Point>, Monday to
          Friday, Indian Standard Time. Anything about money or safety gets
          looked at first. If you have not heard back in a week, send it again
          — it is far more likely we missed it than that we ignored you.
        </p>
      </Card>

      <div className="mt-12 space-y-8">
        <LegalSection id="routing" title="Who to ask, for what">
          <p>
            Personalise lists classes and keeps the schedule. Your instructor
            runs the class and holds the money, so a lot of what feels like a
            platform problem is theirs to fix — and they will fix it faster.
          </p>
        </LegalSection>

        <ul className="space-y-4">
          {ROUTES.map((r) => (
            <li key={r.title}>
              <Card className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
                  {r.who}
                </p>
                <p className="mt-1 font-semibold text-ink">{r.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {r.body}
                </p>
                {r.href ? (
                  <p className="mt-3 text-sm">
                    <LegalLink href={r.href}>{r.hrefLabel}</LegalLink>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">
                    Write to <SupportEmail />.
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>

        <LegalSection id="helpful" title="What to put in the email">
          <p>
            It saves a round trip, and most questions can then be answered on
            the first reply:
          </p>
          <LegalList>
            <li>The email address on your account.</li>
            <li>Your instructor&rsquo;s name, and the class.</li>
            <li>
              Roughly when it happened, and what you expected to happen instead.
            </li>
          </LegalList>
          <p className="text-sm text-ink-faint">
            Never send us your password, a UPI PIN or bank credentials. We will
            never ask for any of them.
          </p>
        </LegalSection>

        <LegalSection id="grievance" title="Grievances">
          <p>
            For a formal complaint about how your personal data is handled, the
            grievance contact and the timelines we work to are set out in the{" "}
            <LegalLink href="/legal/privacy">privacy policy</LegalLink>. For
            money, start with{" "}
            <LegalLink href="/legal/refunds">
              refunds and cancellations
            </LegalLink>
            .
          </p>
        </LegalSection>
      </div>

      <LegalFooterNav />
    </div>
  );
}
