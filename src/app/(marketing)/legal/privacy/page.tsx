import type { Metadata } from "next";

import { LEGAL } from "@/lib/legal";
import { FREE_CANCELLATION_HOURS } from "@/lib/booking-policy";
import {
  Fill,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  Point,
  SupportEmail,
} from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Personalise collects, who can see it, how long it is kept, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="What we collect, who sees it, how long we keep it, and how to get rid of it. Written to be read, not to be scrolled past."
    >
      <LegalSection id="who" title="Who this is">
        <p>
          Personalise is run by{" "}
          <Point>
            <Fill value={LEGAL.operatorName} label="Operator name" />
          </Point>
          , at <Fill value={LEGAL.address} label="Postal address" />. Questions
          about anything on this page go to <SupportEmail />.
        </p>
        <p>
          Personalise is a place where independent instructors list their
          classes and students book them. Your instructor is a separate person
          or business, not part of ours — so this policy covers what{" "}
          <em>we</em> do with your data, and section{" "}
          <LegalLink href="#sharing">&ldquo;Who else sees it&rdquo;</LegalLink>{" "}
          covers what reaches them.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <p>When you create an account:</p>
        <LegalList>
          <li>
            <Point>Your name</Point> — shown to your instructor on their class
            register, and to other people in a live class.
          </li>
          <li>
            <Point>Your email address</Point> — how you sign in, and where
            booking confirmations, class reminders and password resets go.
          </li>
          <li>
            <Point>Your phone number, if you give one.</Point> It is optional.
            It exists so an instructor who has just been handed cash by someone
            can find the right account without knowing their exact email.
          </li>
          <li>
            <Point>Your password</Point>, stored only as a bcrypt hash. We
            cannot read it, and neither can anyone who steals the database.
          </li>
          <li>
            <Point>Your timezone</Point>, which decides how every class time on
            the site is shown to you. It starts as Asia/Kolkata and you can
            change it in Settings.
          </li>
        </LegalList>

        <p>Then, as a result of actually using the service:</p>
        <LegalList>
          <li>
            The classes you enrol in, the passes you hold, and how many sessions
            are left on each.
          </li>
          <li>
            The sessions you book, cancel or are waitlisted for, and whether you
            were marked present.
          </li>
          <li>
            Pass codes you redeem, and which pass each one turned into.
          </li>
          <li>
            Payments your instructor records against your name: the amount, the
            date, what it was for, an internal reference number, and that it was
            paid offline. See{" "}
            <LegalLink href="#money">&ldquo;Money&rdquo;</LegalLink> — no card
            or bank details are involved.
          </li>
          <li>
            The notifications we send you, so they can appear in the bell menu.
          </li>
        </LegalList>

        <p>If you teach here, your public profile holds whatever you put in it:</p>
        <LegalList>
          <li>
            Bio, headline, city, disciplines, languages, certifications, years
            of experience, and any social or website links you add.
          </li>
          <li>The addresses of the venues where you teach.</li>
          <li>
            The <Point>UPI ID, bank details or payment note</Point> you choose
            to show students on your enrol page. These are published on purpose
            — that is how a student pays you — so only put in details you are
            happy for strangers to see.
          </li>
        </LegalList>

        <p>
          One more, for security rather than for you: when someone tries to sign
          in, sign up or reset a password, we count attempts against their{" "}
          <Point>IP address</Point> so a single machine cannot grind through
          passwords. Those counters are deleted after 24 hours and are never
          linked to your account record.
        </p>
      </LegalSection>

      <LegalSection id="dont" title="What we don't collect">
        <LegalList>
          <li>
            <Point>No card numbers, no UPI PIN, no bank credentials.</Point>{" "}
            There is no payment form anywhere on this site. There is nothing to
            leak.
          </li>
          <li>
            <Point>No analytics, no advertising, no tracking pixels.</Point> The
            site loads no third-party scripts, no third-party fonts and no
            trackers. Nobody is building a profile of you here, because there is
            nothing here doing the building.
          </li>
          <li>
            <Point>One cookie</Point>, called{" "}
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-sm text-ink">
              personalise_session
            </code>
            . It keeps you signed in for 30 days, cannot be read by JavaScript,
            and is deleted when you sign out. There is no cookie banner because
            there is nothing optional to consent to.
          </li>
          <li>
            <Point>We do not sell, rent or trade personal data.</Point> Not to
            advertisers, not to data brokers, not to anyone.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="money" title="Money: currently handled entirely offline">
        <p>
          This is unusual enough to be worth stating plainly.{" "}
          <Point>
            Personalise does not hold, process or move any money today.
          </Point>{" "}
          You can see every price on a class page, but there is no checkout.
        </p>
        <p>
          You pay your instructor directly — cash, UPI, or a bank transfer — the
          same way you already would. They then either record the payment
          themselves or hand you a pass code to redeem, and your pass activates.
          The only thing we store is the record of that: amount, date,
          description, reference number.
        </p>
        <p>
          When online payments are switched on later, a payment gateway
          (Razorpay) will become a processor of your payment data, and this page
          will be updated to say so <em>before</em> that happens — not after.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="Who else sees it">
        <p>
          <Point>Your instructor.</Point> They see your name, your email, your
          phone number if you gave one, which of their classes you are enrolled
          in and booked into, whether you attended, what is left on your pass,
          and the payments they have recorded for you. That is a class register.
          They cannot see anything about your dealings with any other
          instructor.
        </p>
        <p>
          <Point>Other people in a live class.</Point> If you join an online
          class, the others in the room see the name on your account and
          whatever your camera and microphone are sending.
        </p>
        <p>
          <Point>Three companies help run the service.</Point> This is the
          complete list as of today:
        </p>
        <LegalList>
          <li>
            <Point>Vercel</Point> — hosting. Every page you load is served by
            them, so they handle your requests and keep short-lived server logs.
          </li>
          <li>
            <Point>Turso</Point> — the database. Everything described above is
            stored there.
          </li>
          <li>
            <Point>Resend</Point> — transactional email, when it is configured.
            They receive your email address and the contents of the message we
            are sending you.
          </li>
        </LegalList>
        <p>
          Both live video and the payment gateway are switched off today, so
          neither receives anything about you. When either is turned on, it gets
          added to the list above first.
        </p>
        <p>
          Beyond that, we would only hand over data if a court or a law
          enforcement agency lawfully required it, or if it were needed to
          investigate abuse or a safety problem on the platform.
        </p>
      </LegalSection>

      <LegalSection id="email" title="Email we send you">
        <p>Every email from Personalise is about something you did:</p>
        <LegalList>
          <li>A booking confirmation, or a note that you are on a waitlist.</li>
          <li>A reminder about an hour before a class you booked starts.</li>
          <li>
            A cancellation — yours, or your instructor&rsquo;s — and whether the
            session credit came back to your pass.
          </li>
          <li>
            A seat opening up on a waitlist you were on.
          </li>
          <li>
            A payment your instructor recorded, or corrected.
          </li>
          <li>A password reset link you asked for.</li>
        </LegalList>
        <p>
          <Point>There is no marketing email</Point>, no newsletter and no
          promotional list, so there is nothing to unsubscribe from. If you want
          the class emails to stop, cancel the bookings or delete the account.
        </p>
      </LegalSection>

      <LegalSection id="where" title="Where it is stored">
        <p>
          On servers run by Vercel and Turso, which may be outside India. By
          using Personalise you agree to your data being stored and processed
          there.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <LegalList>
          <li>
            <Point>Your account and its records</Point> — for as long as the
            account exists. Bookings and payment records are your
            instructor&rsquo;s ledger as much as yours, which is why they stay
            while you are still their student.
          </li>
          <li>
            <Point>After you delete your account</Point> — your name, email,
            phone and photo go immediately. Payments, invoices and attendance
            records stay for eight financial years, because Indian law requires
            books of account to be kept that long, but they no longer carry
            anything that identifies you.{" "}
            <LegalLink href="/account/delete">
              The deletion page lists exactly what survives.
            </LegalLink>
          </li>
          <li>
            <Point>Password reset links</Point> — stored only as a hash, usable
            once, and expired shortly after they are issued.
          </li>
          <li>
            <Point>Sign-in attempt counters</Point> — deleted after 24 hours.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="rights" title="Your rights over your data">
        <LegalList>
          <li>
            <Point>See it.</Point> Your dashboard already shows your bookings,
            your passes and every payment recorded against you. Ask us at{" "}
            <SupportEmail /> for anything it does not show.
          </li>
          <li>
            <Point>Correct it.</Point> Name, phone and timezone are editable in
            Settings. If a payment or a booking looks wrong, your instructor can
            fix it — they are the one who recorded it.
          </li>
          <li>
            <Point>Delete it.</Point> You can close your account yourself at{" "}
            <LegalLink href="/account/delete">/account/delete</LegalLink>, or
            from Settings. Your name, email address, phone number and photo are
            erased, your password is destroyed so the account can never be
            signed into again, your upcoming bookings are cancelled and your
            instructor page comes down. Payment records and the classes you
            already attended are kept, with your name replaced by
            &ldquo;Deleted account&rdquo;, because they are your
            instructor&rsquo;s books as well as your history — see{" "}
            <LegalLink href="/account/delete">what is kept, and for how long</LegalLink>
            . Emails already sent cannot be recalled, and deleting does not
            settle any money owed either way — sort that out with your
            instructor first.
          </li>
          <li>
            <Point>Ask a human.</Point> Write to <SupportEmail /> and a person
            will read it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="security" title="How it is protected">
        <LegalList>
          <li>Passwords are hashed with bcrypt and never stored in readable form.</li>
          <li>
            The session cookie is signed, HTTP-only, and sent only over HTTPS in
            production.
          </li>
          <li>
            Password reset links are stored only as a SHA-256 digest, work once,
            and expire.
          </li>
          <li>
            Sign-in, sign-up and reset requests are rate limited, so a stolen
            password list cannot be tried at speed.
          </li>
        </LegalList>
        <p>
          None of that makes a system perfect. If you spot something that looks
          wrong, tell us at <SupportEmail /> and we will take it seriously.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          An account here is for adults. If a child is learning with an
          instructor on Personalise, a parent or guardian should hold the
          account and book on their behalf — the name, email and phone number on
          it should be the adult&rsquo;s. If you believe a child has created an
          account, write to <SupportEmail /> and we will remove it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          When something material changes — a new processor, online payments
          going live — we update this page and the date at the top before the
          change takes effect. If it affects how your data is used, we will
          email you as well.
        </p>
      </LegalSection>

      <LegalSection id="grievance" title="Complaints and grievances">
        <p>
          Under India&rsquo;s Information Technology (Reasonable Security
          Practices and Procedures and Sensitive Personal Data or Information)
          Rules, 2011, you can raise a grievance about how your data is handled
          with:
        </p>
        <LegalList>
          <li>
            <Point>
              <Fill value={LEGAL.operatorName} label="Operator name" />
            </Point>
          </li>
          <li>
            <SupportEmail />
          </li>
          <li>
            <Fill value={LEGAL.phone} label="Phone number" />
          </li>
          <li>
            <Fill value={LEGAL.address} label="Postal address" />
          </li>
        </LegalList>
        <p>
          We aim to acknowledge within two working days and to resolve within 30
          days, which is what the rules require.
        </p>
        <p className="text-sm text-ink-faint">
          A note on scope: cancelling a class inside the{" "}
          {FREE_CANCELLATION_HOURS}-hour window, or a refund you are owed, is
          not a privacy matter — see{" "}
          <LegalLink href="/legal/refunds">
            refunds and cancellations
          </LegalLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
