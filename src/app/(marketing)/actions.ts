"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bookSession, cancelBooking } from "@/lib/booking";
import { startCheckout } from "@/lib/checkout";
import { previewPassCode, redeemPassCode } from "@/lib/pass-codes";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/actions";

/** Book (or waitlist) a class the student already has a pass for. */
export async function bookSessionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const sessionId = str(form, "sessionId");
  // requireUser, not getCurrentUser: it also refuses an account whose email
  // has never been confirmed. A booking is a seat held and a reminder emailed,
  // both of which are worthless against an address nobody reads.
  const user = await requireUser(`/classes/${sessionId}`);

  const result = await bookSession({ studentId: user.id, sessionId });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/classes/${sessionId}`);
  revalidatePath("/dashboard");

  return ok(
    result.status === "WAITLISTED"
      ? `You're #${result.waitlistPosition} on the waitlist. We'll email you if a seat opens.`
      : "Booked. See you there.",
  );
}

export async function cancelBookingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard/bookings");

  const result = await cancelBooking({
    bookingId: str(form, "bookingId"),
    asStudentId: user.id,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/bookings");

  return ok(
    result.refundedCredit
      ? "Cancelled — the session credit is back on your pass."
      : "Cancelled.",
  );
}

/**
 * Look a pass code up without spending it, so the student can see what they're
 * about to activate and catch a mistyped code before it's consumed.
 */
export async function previewPassCodeAction(code: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Sign in to redeem a code." };
  if (!user.emailVerifiedAt) {
    return { ok: false as const, error: "Confirm your email address first." };
  }
  return previewPassCode(code);
}

export async function redeemPassCodeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const code = str(form, "code");
  const user = await requireUser("/dashboard/redeem");

  const result = await redeemPassCode({ studentId: user.id, code });
  if (!result.ok) return fail(result.error);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/passes");
  revalidatePath("/dashboard/payments");

  return ok(`${result.label} is active. Book your first class whenever you like.`);
}

/** Start paying for a pass. Redirects into the checkout. */
export async function enrolAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const planId = str(form, "planId");
  const returnTo = str(form, "returnTo");

  const user = await requireUser(returnTo || "/instructors");

  const result = await startCheckout({ studentId: user.id, planId });
  if (!result.ok) return fail(result.error);

  redirect(`/checkout/${result.paymentId}`);
}
