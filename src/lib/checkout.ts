import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import {
  db,
  enrollments,
  offerings,
  payments,
  pricingPlans,
  users,
} from "@/db";
import { env } from "./env";
import { generateInvoiceNo, getPaymentProvider } from "./payments";
import { EnrollmentStatus, NotificationType, PaymentStatus, Role } from "./enums";
import { notify } from "./notify";
import { addDays } from "./time";
import { formatMoney } from "./utils";

/**
 * Checkout.
 *
 * Two steps, deliberately separated:
 *   1. `startCheckout` creates a Payment row in CREATED and an order with the
 *      provider. Nothing is granted yet.
 *   2. `fulfilPayment` is the only place that flips a payment to PAID and
 *      creates the enrolment. It's idempotent and safe to call from both the
 *      browser return and the webhook — whichever arrives first wins, and the
 *      second is a no-op.
 *
 * That split is what stops a student losing access because they closed the tab,
 * and stops them getting two enrolments because they didn't.
 */

export async function startCheckout(args: {
  studentId: string;
  planId: string;
}): Promise<
  | { ok: true; paymentId: string; orderId: string; checkoutKey: string | null }
  | { ok: false; error: string }
> {
  // The authoritative gate. The UI hides the pay button when online payments
  // are off, but this is what a hand-crafted POST hits.
  if (!env.onlinePayments) {
    return {
      ok: false,
      error:
        "Online payment isn't switched on yet. Pay your instructor directly and they'll activate your pass.",
    };
  }

  const plan = await db.query.pricingPlans.findFirst({
    where: eq(pricingPlans.id, args.planId),
    with: { offering: { with: { instructor: true } } },
  });
  if (!plan || !plan.isActive) return { ok: false, error: "That plan is no longer available." };

  // Never take money for a suspended instructor — refunding afterwards is far
  // worse for everyone than declining up front.
  if (plan.offering.instructor.isSuspended) {
    return { ok: false, error: "This instructor isn't accepting new students right now." };
  }

  const student = await db.query.users.findFirst({
    where: eq(users.id, args.studentId),
  });
  if (!student) return { ok: false, error: "Sign in to continue." };

  const provider = getPaymentProvider();
  const invoiceNo = generateInvoiceNo();

  const [payment] = await db
    .insert(payments)
    .values({
      studentId: args.studentId,
      instructorId: plan.offering.instructorId,
      invoiceNo,
      description: `${plan.offering.title} — ${plan.name}`,
      amountPaise: plan.amountPaise,
      currency: "INR",
      // UPI first: it's what the checkout will default to, and what most
      // students in India actually use. Corrected from the provider on capture.
      method: "UPI",
      provider: provider.name,
      status: PaymentStatus.CREATED,
    })
    .returning();

  let order;
  try {
    order = await provider.createOrder({
      amountPaise: plan.amountPaise,
      currency: "INR",
      referenceId: payment.id,
      description: payment.description,
      customer: {
        name: student.name,
        email: student.email,
        phone: student.phone,
      },
    });
  } catch (err) {
    await db
      .update(payments)
      .set({
        status: PaymentStatus.FAILED,
        failureReason: err instanceof Error ? err.message : "Order creation failed",
      })
      .where(eq(payments.id, payment.id));
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }

  await db
    .update(payments)
    .set({ providerOrderId: order.orderId, status: PaymentStatus.PENDING })
    .where(eq(payments.id, payment.id));

  return {
    ok: true,
    paymentId: payment.id,
    orderId: order.orderId,
    checkoutKey: order.checkoutKey,
  };
}

/**
 * Mark a payment paid and grant what it bought.
 *
 * Idempotent on payment status — calling it twice never creates two enrolments.
 */
export async function fulfilPayment(args: {
  paymentId: string;
  providerPaymentId: string;
  method?: string;
}): Promise<{ ok: true; enrollmentId: string | null } | { ok: false; error: string }> {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, args.paymentId),
  });
  if (!payment) return { ok: false, error: "Payment not found." };

  if (payment.status === PaymentStatus.PAID) {
    return { ok: true, enrollmentId: payment.enrollmentId };
  }

  // The webhook and the browser callback are designed to race, and they
  // routinely arrive within the same second. A read-then-write guard lets both
  // pass the status check and grant an enrolment each, so the student pays
  // once and gets two passes. Making the status flip itself the lock — only
  // one caller can move a row out of non-PAID — is what actually serialises
  // them. Whoever loses the race falls through to the already-PAID branch.
  const claim = await db
    .update(payments)
    .set({
      status: PaymentStatus.PAID,
      providerPaymentId: args.providerPaymentId,
      method: args.method ?? payment.method,
      paidAt: new Date(),
    })
    .where(and(eq(payments.id, payment.id), ne(payments.status, PaymentStatus.PAID)));

  if (claim.rowsAffected === 0) {
    const settled = await db.query.payments.findFirst({
      where: eq(payments.id, args.paymentId),
      columns: { enrollmentId: true },
    });
    return { ok: true, enrollmentId: settled?.enrollmentId ?? null };
  }

  // Work out what this payment bought by matching the invoice description back
  // to a plan. Payments always carry the plan through the order notes, but the
  // description lookup keeps the mock flow honest too.
  const enrollmentId = payment.enrollmentId ?? (await grantEnrollment(payment.id));

  await notify({
    userId: payment.studentId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: `Payment received — ${formatMoney(payment.amountPaise)}`,
    body: `${payment.description}. Invoice ${payment.invoiceNo}.`,
    link: "/dashboard/payments",
    email: true,
  });

  const instructorUser = await db.query.instructorProfiles.findFirst({
    where: (p, { eq: e }) => e(p.id, payment.instructorId),
    columns: { userId: true },
  });
  if (instructorUser) {
    await notify({
      userId: instructorUser.userId,
      type: NotificationType.NEW_ENROLLMENT,
      title: `New enrolment — ${formatMoney(payment.amountPaise)}`,
      body: payment.description,
      link: "/studio/students",
    });
  }

  return { ok: true, enrollmentId };
}

/** Creates the enrolment a paid payment entitles the student to. */
async function grantEnrollment(paymentId: string): Promise<string | null> {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
  if (!payment) return null;

  // The description is "<offering title> — <plan name>"; resolve back to the plan.
  const [title, planName] = payment.description.split(" — ");
  const offering = await db.query.offerings.findFirst({
    where: eq(offerings.title, title ?? ""),
    with: { plans: true },
  });
  if (!offering) return null;

  const plan =
    offering.plans.find((p) => p.name === planName) ?? offering.plans[0] ?? null;
  if (!plan) return null;

  const startedAt = new Date();
  const [enrollment] = await db
    .insert(enrollments)
    .values({
      studentId: payment.studentId,
      offeringId: offering.id,
      instructorId: offering.instructorId,
      planId: plan.id,
      status: EnrollmentStatus.ACTIVE,
      sessionsRemaining: plan.sessionsIncluded,
      startedAt,
      expiresAt: plan.validityDays ? addDays(startedAt, plan.validityDays) : null,
    })
    .returning();

  await db
    .update(payments)
    .set({ enrollmentId: enrollment.id })
    .where(eq(payments.id, payment.id));

  return enrollment.id;
}

/** Records a cash or bank-transfer payment taken outside the platform. */
export async function recordOfflinePayment(args: {
  studentId: string;
  instructorId: string;
  offeringId: string;
  planId: string;
  amountPaise: number;
  note?: string;
}): Promise<
  | { ok: true; paymentId: string; enrollmentId: string }
  | { ok: false; error: string }
> {
  const plan = await db.query.pricingPlans.findFirst({
    where: eq(pricingPlans.id, args.planId),
    with: { offering: true },
  });
  if (!plan) return { ok: false, error: "Plan not found." };

  // A student who already has an active pass for this class is either being
  // double-charged (a double-click, or an instructor who forgot they'd
  // already logged it) or is legitimately topping up a pass that's run low
  // or out of sessions — recording a second cash payment is exactly how that
  // happens in the real world. Credit-based passes top up in place; anything
  // else (an unlimited/time-based pass that's still active) is still
  // rejected, since there's nothing sensible to add to it.
  const active = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, args.studentId),
      eq(enrollments.offeringId, args.offeringId),
      eq(enrollments.status, EnrollmentStatus.ACTIVE),
    ),
  });

  if (active && active.sessionsRemaining === null) {
    return {
      ok: false,
      error:
        "That student already has an active pass for this class. Cancel or let the existing pass expire before adding another.",
    };
  }

  const startedAt = new Date();
  let enrollmentId: string;

  if (active) {
    // Top up in place rather than creating a second pass — same enrolment,
    // more credits, expiry pushed out if this plan reaches further than the
    // one already on file.
    const addedSessions = plan.sessionsIncluded ?? 0;
    const candidateExpiry = plan.validityDays ? addDays(startedAt, plan.validityDays) : null;
    const nextExpiresAt =
      candidateExpiry && (!active.expiresAt || candidateExpiry > active.expiresAt)
        ? candidateExpiry
        : active.expiresAt;

    await db
      .update(enrollments)
      .set({
        sessionsRemaining: (active.sessionsRemaining ?? 0) + addedSessions,
        expiresAt: nextExpiresAt,
      })
      .where(eq(enrollments.id, active.id));
    enrollmentId = active.id;
  } else {
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        studentId: args.studentId,
        offeringId: args.offeringId,
        instructorId: args.instructorId,
        planId: plan.id,
        status: EnrollmentStatus.ACTIVE,
        sessionsRemaining: plan.sessionsIncluded,
        startedAt,
        expiresAt: plan.validityDays ? addDays(startedAt, plan.validityDays) : null,
      })
      .returning();
    enrollmentId = enrollment.id;
  }

  const [payment] = await db
    .insert(payments)
    .values({
      studentId: args.studentId,
      instructorId: args.instructorId,
      enrollmentId,
      invoiceNo: generateInvoiceNo(),
      description: `${plan.offering.title} — ${plan.name}${args.note ? ` (${args.note})` : ""}`,
      amountPaise: args.amountPaise,
      method: "OFFLINE",
      provider: "offline",
      status: PaymentStatus.PAID,
      paidAt: new Date(),
    })
    .returning();

  await notify({
    userId: args.studentId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: "Payment recorded",
    body: `Your instructor recorded a payment of ${formatMoney(args.amountPaise)} for ${plan.offering.title}.`,
    link: "/dashboard/payments",
    email: true,
  });

  return { ok: true, paymentId: payment.id, enrollmentId };
}

/**
 * Finds the student account an instructor is recording a cash payment against.
 *
 * Looked up by exact email rather than picked from a list, because the people
 * an instructor most needs to enrol are the ones who have *never* enrolled
 * before — a dropdown built from existing enrolments can never contain them.
 * Email is matched case-insensitively since people type their own address
 * however they like.
 */
export async function findStudentByEmail(
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return null;

  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);

  if (!row) return null;
  // Instructors and admins have their own accounts; enrolling one as a student
  // would put a teacher on their own register.
  if (row.role !== Role.STUDENT) return null;

  return { id: row.id, name: row.name, email: row.email };
}
