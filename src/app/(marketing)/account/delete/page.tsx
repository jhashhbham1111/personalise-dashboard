import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL } from "@/lib/legal";
import { Fill, LegalList, LegalPage, LegalSection, Point } from "@/components/legal";

export const metadata: Metadata = {
  title: "Delete your Personalise account",
  description:
    "How to delete your Personalise account and what happens to your data, including what is erased immediately and what is kept.",
};

/**
 * The account-deletion page Google Play requires: a URL anyone can open
 * without signing in, without installing the app, and without an account.
 *
 * A reviewer compares it line by line against the app's Data safety form and
 * against what the app actually does, so everything below has to stay true of
 * src/lib/account-deletion.ts. If the retained set changes there, change this
 * page in the same commit.
 */
export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Deleting your Personalise account"
      summary="Personalise is a marketplace where independent instructors run classes and students book them. You can delete your account from inside the app at any time. This page explains how, and exactly what happens to your data."
    >
      <LegalSection id="in-app" title="Delete it yourself, in the app">
        <p>
          Deletion lives in the app under <Point>Settings</Point>, and takes
          effect immediately — there is no waiting period and nobody has to
          approve it.
        </p>
        <ol className="ml-5 list-decimal space-y-2 marker:text-ink-faint">
          <li>
            Sign in at{" "}
            <Link href="/login" className="text-brand-600 hover:underline">
              personalise
            </Link>{" "}
            with the email address on your account.
          </li>
          <li>
            Open the account menu — your photo or initials, at the top right —
            and choose <Point>Settings</Point>.
          </li>
          <li>
            Scroll to <Point>Delete my account</Point> at the bottom of that
            page. It lists what will be erased and what will be kept.
          </li>
          <li>
            Press <Point>Delete my account</Point>, type your email address into
            the box to confirm, then press <Point>Delete permanently</Point>.
          </li>
          <li>
            You are signed out on the spot. Your login stops working from that
            moment.
          </li>
        </ol>
        <p>
          There is no separate Personalise account for the app store, the website
          and the Android app — they are one account, and deleting it removes it
          everywhere.
        </p>
      </LegalSection>

      <LegalSection id="erased" title="What is erased immediately">
        <p>
          These are overwritten in our database the moment you confirm. They are
          not moved to a bin, and we cannot restore them afterwards, so please
          download anything you want to keep first.
        </p>
        <LegalList>
          <li>
            <Point>Your name</Point> — replaced everywhere it appears, including
            on your instructors&apos; class registers, with &ldquo;Deleted
            account&rdquo;.
          </li>
          <li>
            <Point>Your email address</Point> — replaced with an internal
            placeholder that cannot receive mail. We stop emailing you.
          </li>
          <li>
            <Point>Your phone number</Point> — removed. Instructors can no longer
            see it.
          </li>
          <li>
            <Point>Your profile photo</Point> — removed.
          </li>
          <li>
            <Point>Your password</Point> — destroyed and replaced with a value no
            password can match. The account can never be signed into again, by
            you or anyone else.
          </li>
          <li>
            <Point>Your upcoming bookings</Point> — cancelled, so the seats go
            back to other students and anyone on the waitlist moves up.
          </li>
          <li>
            <Point>Your instructor page</Point>, if you teach — unpublished and
            withdrawn from the public site, along with every class listing on it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="kept" title="What is kept, and for how long">
        <p>
          A few records survive deletion because the law or somebody else&apos;s
          business depends on them. None of them carries your name, email address
          or phone number after deletion — they point at the anonymised account,
          which reads as &ldquo;Deleted account&rdquo;.
        </p>
        <LegalList>
          <li>
            <Point>Payments and invoices</Point> — the amount, date, invoice
            number and payment method of anything you paid for. Indian law
            requires books of account to be kept for eight financial years, so we
            keep these for that long and then delete them.
          </li>
          <li>
            <Point>Classes you already attended</Point> — the enrolment and
            attendance record stays on the instructor&apos;s register so their
            class history and their earnings still add up. Kept for the same eight
            financial years.
          </li>
          <li>
            <Point>Earnings and fee totals for instructors you paid</Point> — your
            payments are part of another person&apos;s income record, and removing
            them would leave a hole in their books.
          </li>
          <li>
            <Point>Anonymised counts</Point> — things like &ldquo;how many people
            booked this class&rdquo;. These carry no personal data at all and are
            kept indefinitely.
          </li>
        </LegalList>
        <p>
          We do not sell personal data, and we do not keep a backup copy of the
          erased fields for later use.
        </p>
      </LegalSection>

      <LegalSection id="instructors" title="If you teach on Personalise">
        <p>
          An instructor cannot delete an account while students are still holding
          passes they have paid for — vanishing mid-term would leave those
          students with classes owed to them and no way to reach you. If that
          applies to you, the Settings page says so and the app will not let the
          deletion through until you have:
        </p>
        <LegalList>
          <li>
            hidden your page with <Point>Hide my page</Point> in{" "}
            <Point>Studio → My profile</Point>, so nobody new can enrol;
          </li>
          <li>
            let the current passes run out, or voided them in{" "}
            <Point>Studio → Fees</Point> — refunding anyone who is owed money.
          </li>
        </LegalList>
        <p>
          Once no active passes are left, deletion works exactly as it does for a
          student.
        </p>
      </LegalSection>

      <LegalSection id="cannot-sign-in" title="If you can no longer sign in">
        <p>
          Deleting the account yourself is the fastest route, but you do not need
          access to the app to have it done. Email{" "}
          <Fill value={LEGAL.supportEmail} label="Support email" /> from the
          address on the account, with the subject line{" "}
          <Point>Delete my account</Point>. Include the email address or phone
          number you signed up with so we can find the right record.
        </p>
        <p>
          If you have lost access to that mailbox too, write from any address and
          tell us the name, city and the instructor or class you last booked; we
          will ask you for whatever else we need to be confident it is your
          account before we erase anything.
        </p>
        <p>
          We confirm by reply and complete the deletion within 30 days of
          verifying the request. It is carried out exactly as described above.
        </p>
      </LegalSection>

      <LegalSection id="operator" title="Who this is">
        <p>
          Personalise is operated by{" "}
          <Fill value={LEGAL.operatorName} label="Operator name" />, of{" "}
          <Fill value={LEGAL.address} label="Registered address" />. You can reach
          us at <Fill value={LEGAL.supportEmail} label="Support email" /> or{" "}
          <Fill value={LEGAL.phone} label="Phone number" />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
