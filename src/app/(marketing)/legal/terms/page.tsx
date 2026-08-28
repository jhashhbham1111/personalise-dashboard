import type { Metadata } from "next";

import { LEGAL } from "@/lib/legal";
import {
  FREE_CANCELLATION_HOURS,
  JOIN_WINDOW_AFTER_MIN,
  JOIN_WINDOW_BEFORE_MIN,
} from "@/lib/booking-policy";
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
  title: "Terms of service",
  description:
    "The rules for using Personalise: what the platform does, what your instructor does, and who is responsible for what.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      summary="The agreement between you and us. The short version: we run the software, your instructor runs the class, and the money passes between the two of you without touching us."
    >
      <LegalSection id="who" title="Who you are agreeing with">
        <p>
          Personalise is operated by{" "}
          <Point>
            <Fill value={LEGAL.operatorName} label="Operator name" />
          </Point>
          , at <Fill value={LEGAL.address} label="Postal address" />. In these
          terms, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean that operator, and
          &ldquo;you&rdquo; means whoever is using the site — as a student, as
          an instructor, or both.
        </p>
        <p>
          By creating an account or booking a class you accept these terms, the{" "}
          <LegalLink href="/legal/privacy">privacy policy</LegalLink> and the{" "}
          <LegalLink href="/legal/refunds">
            refund and cancellation policy
          </LegalLink>
          . If you do not accept them, do not use the service.
        </p>
      </LegalSection>

      <LegalSection id="what" title="What Personalise is, and what it isn't">
        <p>
          Personalise is listing and scheduling software. Independent
          instructors publish their classes, prices and timetables on it, and
          students find them, buy a pass and book a seat.
        </p>
        <p>
          <Point>Your instructor is not our employee or our agent.</Point> They
          set their own prices, decide their own schedule, teach their own
          material and are responsible for their own tax, licences and
          insurance. The class itself is an agreement between you and them. We
          are not a party to it.
        </p>
        <p>
          We do not teach, we do not vet teaching quality, and we do not promise
          any result from a class. What we do is run the software that keeps the
          schedule, the register and the pass balances straight.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="Your account">
        <LegalList>
          <li>
            You need to be 18 or older to hold an account. A parent or guardian
            should hold the account for a child and book on their behalf.
          </li>
          <li>
            Give real details. Your instructor uses your name, email and phone
            to find you and to tell you when a class changes.
          </li>
          <li>
            One account per person, and it is yours alone — do not share the
            login. A pass is for the person who bought it.
          </li>
          <li>
            Keep your password to yourself. If you think someone else has it,
            reset it and tell us at <SupportEmail />.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="money" title="Paying for classes">
        <p>
          <Point>
            Right now, no money passes through Personalise at all.
          </Point>{" "}
          There is no checkout on this site. You see the instructor&rsquo;s
          prices, and you pay them directly — cash, UPI or bank transfer. They
          record the payment, or hand you a pass code to redeem, and the pass
          activates.
        </p>
        <LegalList>
          <li>
            The price is the instructor&rsquo;s, not ours. So is any tax on it.
          </li>
          <li>
            The reference number shown on a payment in your dashboard is an
            internal record of what your instructor entered.{" "}
            <Point>It is not a GST tax invoice.</Point> If you need one, ask
            your instructor.
          </li>
          <li>
            We cannot confirm a payment we did not receive. If your pass has not
            activated, the person to ask is the instructor you paid.
          </li>
        </LegalList>
        <p>
          If online payments are switched on in future, these terms and the
          refund policy will be updated before that happens.
        </p>
      </LegalSection>

      <LegalSection id="passes" title="Passes and pass codes">
        <LegalList>
          <li>
            A pass covers one instructor&rsquo;s class. It either carries a
            number of sessions, or is unlimited within a validity window, or
            both.
          </li>
          <li>
            Booking a class spends one session from a credit-based pass. It is
            spent only when you actually get a seat — being waitlisted costs
            nothing.
          </li>
          <li>
            When a pass expires, or runs out of sessions, you cannot book with
            it any more. Whether to extend it is your instructor&rsquo;s call.
          </li>
          <li>
            A pass code works once, and can be revoked by the instructor who
            issued it until someone redeems it. A code carries the price and
            terms it was issued with, so it is still worth what you paid even if
            the instructor later changes that plan.
          </li>
          <li>
            Passes and codes are not transferable and have no cash value from
            us. See{" "}
            <LegalLink href="/legal/refunds">
              refunds and cancellations
            </LegalLink>
            .
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="booking" title="Booking, waitlists and cancelling">
        <LegalList>
          <li>
            Classes have a fixed capacity. If a class is full you go on the
            waitlist, and you are moved into the first seat that frees up — in
            order, and you are emailed when it happens.
          </li>
          <li>
            You can cancel free of charge up to{" "}
            <Point>{FREE_CANCELLATION_HOURS} hours</Point> before a class
            starts, and the session credit goes straight back on your pass.
            Cancel later than that and the credit is gone — your instructor has
            already held that seat for you.
          </li>
          <li>
            <Point>
              If your instructor cancels, you always get the credit back
            </Point>
            , however little notice they gave, and you are emailed about it.
          </li>
          <li>
            For online classes you can join from {JOIN_WINDOW_BEFORE_MIN}{" "}
            minutes before the start until {JOIN_WINDOW_AFTER_MIN} minutes after
            the end.
          </li>
          <li>
            An instructor whose account is suspended cannot take new bookings,
            whatever their page says.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="conduct" title="How to behave here">
        <p>Do not:</p>
        <LegalList>
          <li>
            Share your account, a pass, or a link to a live class with anyone
            else.
          </li>
          <li>
            Record, screenshot or re-publish a class without the
            instructor&rsquo;s permission.
          </li>
          <li>
            Harass, threaten or abuse an instructor or another student, in a
            class or anywhere else on the platform.
          </li>
          <li>
            Post anything unlawful, misleading or that you have no right to
            post.
          </li>
          <li>
            Attack the service — scraping, brute-forcing sign-ins, probing for
            other people&rsquo;s records, or trying to book what you have not
            paid for.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="instructors" title="If you teach here">
        <p>In addition to everything above:</p>
        <LegalList>
          <li>
            Be who you say you are, and only claim qualifications you actually
            hold.
          </li>
          <li>
            Keep your schedule honest. If you cannot take a class, cancel it in
            the app so your students are told and get their credits back — do
            not just not turn up.
          </li>
          <li>
            Record payments accurately and promptly. A student whose payment is
            not recorded cannot book, and will assume the app is broken.
          </li>
          <li>
            You own your own tax, GST, licences, insurance and any local rules
            about running classes at your venue. We do not handle those for you.
          </li>
          <li>
            You own the content you upload, and you give us permission to show
            it on the site so students can find you.
          </li>
          <li>
            The payment details you publish on your enrol page are visible to
            anyone who visits it. That is deliberate; put in only what you are
            happy to make public.
          </li>
        </LegalList>
        <p>
          <Point>Verification is a basic check, not an endorsement.</Point> We
          review a profile before it appears in the public directory to keep
          obvious nonsense out. It is not a background check, a qualification
          audit or a guarantee of anything to any student.
        </p>
      </LegalSection>

      <LegalSection id="suspension" title="Suspension and removal">
        <p>
          We can hide, suspend or delete an account that breaks these terms,
          that is being used to harm someone, or that we are legally required to
          act on. A suspended instructor disappears from the directory and takes
          no new bookings.
        </p>
        <p>
          If we do this to you and you think it is wrong, write to{" "}
          <SupportEmail /> and a person will look at it.
        </p>
        <p>You can close your own account at any time — see the privacy policy.</p>
      </LegalSection>

      <LegalSection id="health" title="Physical classes, and your own health">
        <p>
          Yoga, dance and fitness classes carry real physical risk. You take part
          at your own risk. Talk to a doctor before starting anything strenuous,
          tell your instructor about any injury, condition or pregnancy, and stop
          if something hurts.
        </p>
        <p>
          Getting yourself to and from an in-person class, and what happens at
          the venue, is between you and your instructor.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="The service itself">
        <p>
          Personalise is offered as it is. It is young software, it is still
          being built, and it will occasionally be down or wrong. We do not
          promise uptime, and we do not promise that a feature that exists today
          will exist in the same form next month.
        </p>
        <p>
          We do keep backups of the database, but keep your own record of
          anything that matters to you.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Who is responsible for what">
        <p>
          A dispute about a class — it did not happen, it was not what was
          advertised, the money was not returned — is between you and your
          instructor. They took the money and they taught the class.
        </p>
        <p>
          Since no money passes through us, our total liability to you for
          anything arising out of the service is limited to what you have paid{" "}
          <em>us</em>, which today is nothing. We are not liable for indirect
          losses, lost income, or a class you missed.
        </p>
        <p>
          <Point>
            None of this takes away rights you have under the Consumer
            Protection Act, 2019
          </Point>{" "}
          or any other Indian law that cannot be contracted out of. Where a term
          here conflicts with such a law, the law wins and the rest of these
          terms still stand.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          We will update these terms as the product changes — most obviously
          when online payments are switched on. The date at the top says when
          they were last reviewed. Continuing to use the service after a change
          means you accept it; if you do not, close your account.
        </p>
      </LegalSection>

      <LegalSection id="law" title="Law and jurisdiction">
        <p>
          These terms are governed by the laws of India. Disputes go to the
          courts of the city in the operator&rsquo;s address above.
        </p>
        <p>
          Anything unclear, write to <SupportEmail /> before assuming the worst.
          Most of what looks like a dispute is a booking that was recorded
          wrongly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
