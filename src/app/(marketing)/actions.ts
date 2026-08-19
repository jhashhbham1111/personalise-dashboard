"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bookSession, cancelBooking } from "@/lib/booking";
import { startCheckout } from "@/lib/checkout";
import { getCurrentUser } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/actions";

/** Book (or waitlist) a class the student already has a pass for. */
export async function bookSessionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  const sessionId = str(form, "sessionId");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/classes/${sessionId}`)}`);

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
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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

/** Start paying for a pass. Redirects into the checkout. */
export async function enrolAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const planId = str(form, "planId");
  const returnTo = str(form, "returnTo");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo || "/instructors")}`);

  const result = await startCheckout({ studentId: user.id, planId });
  if (!result.ok) return fail(result.error);

  redirect(`/checkout/${result.paymentId}`);
}
