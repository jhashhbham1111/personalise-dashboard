import type { Metadata } from "next";

import { FREE_CANCELLATION_HOURS } from "@/lib/booking-policy";
import {
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  Point,
  SupportEmail,
} from "@/components/legal";
import { Alert } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description:
    "How cancelling a class works, when a session credit comes back, and how a refund happens while payments are handled offline.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds and cancellations"
      summary="Two different things live on this page: cancelling a class you booked, which the app handles automatically, and getting your money back, which is between you and your instructor."
    >
      <LegalSection id="short" title="The short version">
        <Alert tone="warning">
          Personalise does not take, hold or move any money. You pay your
          instructor directly, so a refund comes from your instructor directly.
          We cannot return money we never received.
        </Alert>
        <p>
          What the app <em>can</em> do is put the pass back the way it was: take
          back the sessions you have not used, so the record matches whatever
          the two of you agree.
        </p>
      </LegalSection>

      <LegalSection id="cancel" title="Cancelling a class you booked">
        <p>This part is automatic, and it is the same for every instructor.</p>
        <LegalList>
          <li>
            <Point>
              More than {FREE_CANCELLATION_HOURS} hours before the class starts
            </Point>{" "}
            — cancel from your dashboard and the session credit goes straight
            back on your pass. Nothing is lost, and the seat opens for the next
            person on the waitlist.
          </li>
          <li>
            <Point>
              Less than {FREE_CANCELLATION_HOURS} hours before it starts
            </Point>{" "}
            — you can still cancel, but the credit is spent. Your instructor
            held that seat and turned other people away for it. If you have a
            good reason, ask them; they can put the credit back by hand.
          </li>
          <li>
            <Point>On an unlimited pass</Point> — there is no credit to lose.
            Cancelling just frees the seat, and doing it early is a courtesy to
            whoever is waiting.
          </li>
          <li>
            <Point>On a waitlist</Point> — leaving costs nothing. A credit is
            only ever spent when you actually get a seat.
          </li>
          <li>
            <Point>Not turning up</Point> — the same as cancelling late. The
            credit is gone.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="instructor-cancels" title="When your instructor cancels">
        <p>
          <Point>
            You always get the session credit back, whatever the notice.
          </Point>{" "}
          The {FREE_CANCELLATION_HOURS}-hour rule does not apply — you did not
          cause the cancellation. You get an email and an in-app notification
          with their reason, and the credit is on your pass by the time you read
          it.
        </p>
        <p>
          If a class is cancelled repeatedly, or an instructor stops turning up
          altogether, tell us at <SupportEmail />. That is a platform problem,
          not a scheduling one.
        </p>
      </LegalSection>

      <LegalSection id="refund" title="Getting your money back for a pass">
        <p>
          <Point>Ask your instructor.</Point> They took the payment, so they are
          the only person who can return it. Their contact details are on their
          profile page.
        </p>
        <p>If they agree to refund you, here is what happens:</p>
        <LegalList>
          <li>
            They <Point>void the payment</Point> in their Studio. That marks the
            payment reversed and takes back the unused part of your pass — the
            classes you already attended stay attended, and are never clawed
            back below zero.
          </li>
          <li>
            You get an email saying the payment was corrected, and it shows as
            voided in your payments list.
          </li>
          <li>
            <Point>The money itself comes back the way it went out</Point> —
            cash, UPI or bank transfer, from them to you. How quickly is between
            the two of you. We cannot promise a window for money that never
            passed through us, and we would rather say so than print a number we
            cannot honour.
          </li>
        </LegalList>
        <p>
          <Point>Pass codes.</Point> A code you have not redeemed yet can simply
          be revoked by the instructor who issued it. Once you have redeemed it
          it is a pass, and the process above applies.
        </p>
        <p>
          <Point>Expired passes.</Point> A pass that has run past its validity
          window cannot be used, and is not automatically refundable. Whether to
          extend it is your instructor&rsquo;s decision.
        </p>
      </LegalSection>

      <LegalSection id="stuck" title="If you cannot get anywhere with your instructor">
        <p>
          Write to <SupportEmail /> with your name, the instructor and roughly
          when you paid.
        </p>
        <p>What we can do:</p>
        <LegalList>
          <li>Look at what is actually recorded — passes, bookings, payments.</li>
          <li>Contact the instructor and ask them to sort it out.</li>
          <li>Void a payment and correct a pass where the record is plainly wrong.</li>
          <li>
            Suspend an instructor who is taking money and not teaching, so it
            stops happening to somebody else.
          </li>
        </LegalList>
        <p>What we cannot do:</p>
        <LegalList>
          <li>
            Send you money. We never held it. Fixing the record is not the same
            as a refund, and we will not pretend otherwise.
          </li>
        </LegalList>
        <p>
          Nothing on this page limits your rights under the Consumer Protection
          Act, 2019.
        </p>
      </LegalSection>

      <LegalSection id="later" title="When online payments are switched on">
        <p className="text-ink-faint">
          Not in effect yet — written here so you know what is coming.
        </p>
        <p>
          Once payments can be made inside the app through a payment gateway, an
          approved refund will be returned to the original payment method,
          normally within 5&ndash;7 working days of approval, subject to your
          bank. This page will be rewritten to say so plainly, and the{" "}
          <LegalLink href="/legal/terms">terms</LegalLink> updated, before that
          switch is flipped.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
