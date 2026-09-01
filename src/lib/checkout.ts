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
  /** When the money actually changed hands, if not the moment this is recorded. */
  paidAt?: Date;
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
  const candidateExpiry = plan.validityDays ? addDays(startedAt, plan.validityDays) : null;
  let enrollmentId: string;

  /*
   * Only two credit-based passes merge into one.
   *
   * Adding an *unlimited* plan on top of a credit pass used to take this
   * branch too, and `plan.sessionsIncluded ?? 0` then added zero sessions —
   * so a student who paid for a month of unlimited classes got nothing but a
   * later expiry date, on a pass still labelled with whatever they had bought
   * before. It becomes its own enrolment instead, which is what a monthly
   * pass is, and matches how redeeming a pass code already behaves.
   */
  if (active && active.sessionsRemaining !== null && plan.sessionsIncluded !== null) {
    // Top up in place — same enrolment, more credits, expiry pushed out if
    // this plan reaches further than the one already on file.
    const nextExpiresAt =
      candidateExpiry && (!active.expiresAt || candidateExpiry > active.expiresAt)
        ? candidateExpiry
        : active.expiresAt;

    await db
      .update(enrollments)
      .set({
        // The pass is now the thing they most recently bought. Left unset,
        // the card kept naming the original plan — a 10-class pack topped up
        // with a 5-class pack still read "Drop-in" if that was the first one.
        planId: plan.id,
        sessionsRemaining: active.sessionsRemaining + plan.sessionsIncluded,
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
        expiresAt: candidateExpiry,
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
      paidAt: args.paidAt ?? new Date(),
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

export type StudentMatch = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** True when this person has enrolled with the searching instructor before. */
  known: boolean;
};

/**
 * Find a student by name, email or phone.
 *
 * Typing an exact email address is the thing an instructor is least able to do
 * with a queue in front of them — they know the person's name and probably
 * their number. Matching on all three and returning candidates to choose from
 * keeps that ergonomic without the danger of matching on name alone: two
 * students called Priya Sharma are one careless tap from the wrong pass being
 * activated, so the caller always picks a specific id.
 *
 * Results are ordered so the instructor's own students come first — the same
 * name is far more likely to be the one they already teach.
 */
export async function searchStudents(args: {
  query: string;
  instructorId: string;
  limit?: number;
}): Promise<StudentMatch[]> {
  const q = args.query.trim().toLowerCase();
  if (q.length < 2) return [];

  const like = `%${q}%`;
  // Phone is matched on digits only, so "98765 43210" finds "+919876543210".
  const digits = q.replace(/\D/g, "");
  const phoneLike = digits.length >= 4 ? `%${digits}%` : null;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      known: sql<number>`(
        select count(*) from ${enrollments}
         where ${enrollments.studentId} = ${users.id}
           and ${enrollments.instructorId} = ${args.instructorId}
      )`,
    })
    .from(users)
    .where(
      and(
        eq(users.role, Role.STUDENT),
        phoneLike
          ? sql`(lower(${users.name}) like ${like}
                 or lower(${users.email}) like ${like}
                 or replace(replace(replace(coalesce(${users.phone}, ''), ' ', ''), '-', ''), '+', '') like ${phoneLike})`
          : sql`(lower(${users.name}) like ${like}
                 or lower(${users.email}) like ${like})`,
      ),
    )
    .limit(args.limit ?? 8);

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      known: Number(r.known) > 0,
    }))
    .sort((a, b) => Number(b.known) - Number(a.known) || a.name.localeCompare(b.name));
}

/**
 * Record a payment against a pass the instructor describes on the spot.
 *
 * Not every pack an instructor sells exists as a saved plan — a one-off
 * arrangement, a family rate, a pack carried over from before they joined.
 * Forcing those through a dropdown of saved plans meant they either went
 * unrecorded or got logged against the wrong plan, which corrupts the one
 * ledger the instructor is supposed to trust.
 */
export async function recordAdHocPayment(args: {
  studentId: string;
  instructorId: string;
  offeringId: string;
  label: string;
  amountPaise: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  note?: string;
  /** When the money actually changed hands, if not the moment this is recorded. */
  paidAt?: Date;
}): Promise<
  | { ok: true; paymentId: string; enrollmentId: string }
  | { ok: false; error: string }
> {
  const offering = await db.query.offerings.findFirst({
    where: eq(offerings.id, args.offeringId),
  });
  if (!offering) return { ok: false, error: "That class no longer exists." };
  if (offering.instructorId !== args.instructorId) {
    return { ok: false, error: "That class doesn't belong to you." };
  }

  const startedAt = new Date();
  const candidateExpiry = args.validityDays
    ? addDays(startedAt, args.validityDays)
    : null;

  const active = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, args.studentId),
      eq(enrollments.offeringId, args.offeringId),
      eq(enrollments.status, EnrollmentStatus.ACTIVE),
    ),
  });

  let enrollmentId: string;

  if (active && active.sessionsRemaining !== null && args.sessionsIncluded !== null) {
    const nextExpiresAt =
      candidateExpiry && (!active.expiresAt || candidateExpiry > active.expiresAt)
        ? candidateExpiry
        : active.expiresAt;
    await db
      .update(enrollments)
      .set({
        sessionsRemaining: active.sessionsRemaining + args.sessionsIncluded,
        expiresAt: nextExpiresAt,
      })
      .where(eq(enrollments.id, active.id));
    enrollmentId = active.id;
  } else if (active) {
    return {
      ok: false,
      error:
        "That student already has an unlimited pass for this class. Let it expire before adding another.",
    };
  } else {
    const [created] = await db
      .insert(enrollments)
      .values({
        studentId: args.studentId,
        offeringId: args.offeringId,
        instructorId: args.instructorId,
        planId: null,
        status: EnrollmentStatus.ACTIVE,
        sessionsRemaining: args.sessionsIncluded,
        startedAt,
        expiresAt: candidateExpiry,
      })
      .returning();
    enrollmentId = created.id;
  }

  const [payment] = await db
    .insert(payments)
    .values({
      studentId: args.studentId,
      instructorId: args.instructorId,
      enrollmentId,
      invoiceNo: generateInvoiceNo(),
      description: `${offering.title} — ${args.label}${args.note ? ` (${args.note})` : ""}`,
      amountPaise: args.amountPaise,
      method: "OFFLINE",
      provider: "offline",
      status: PaymentStatus.PAID,
      paidAt: args.paidAt ?? new Date(),
    })
    .returning();

  await notify({
    userId: args.studentId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: "Payment recorded",
    body: `Your instructor recorded a payment of ${formatMoney(args.amountPaise)} for ${offering.title}.`,
    link: "/dashboard/payments",
    email: true,
  });

  return { ok: true, paymentId: payment.id, enrollmentId };
}

/**
 * Undo a recorded payment and take back what it granted.
 *
 * Instructors record cash in a hurry and get it wrong — wrong student, wrong
 * amount, recorded twice. Without this the only fix was editing the database.
 * Sessions already spent are not clawed back below zero: a student who has
 * attended two classes keeps having attended them.
 */
export async function voidOfflinePayment(args: {
  paymentId: string;
  instructorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, args.paymentId),
  });
  if (!payment) return { ok: false, error: "Payment not found." };
  if (payment.instructorId !== args.instructorId) {
    return { ok: false, error: "Payment not found." };
  }
  if (payment.method !== "OFFLINE") {
    return {
      ok: false,
      error: "Only cash and pass-code payments can be voided here. Refund online payments through the gateway.",
    };
  }
  if (payment.status === PaymentStatus.REFUNDED) {
    return { ok: false, error: "That payment is already voided." };
  }

  const claim = await db
    .update(payments)
    .set({
      status: PaymentStatus.REFUNDED,
      refundedPaise: payment.amountPaise,
    })
    .where(
      and(
        eq(payments.id, payment.id),
        ne(payments.status, PaymentStatus.REFUNDED),
      ),
    );
  if (claim.rowsAffected === 0) {
    return { ok: false, error: "That payment is already voided." };
  }

  if (payment.enrollmentId) {
    const enrollment = await db.query.enrollments.findFirst({
      where: eq(enrollments.id, payment.enrollmentId),
    });
    if (enrollment) {
      // Work out what this payment added, and remove no more than what's left
      // unspent. Anything already used stays used.
      const plan = enrollment.planId
        ? await db.query.pricingPlans.findFirst({
            where: eq(pricingPlans.id, enrollment.planId),
          })
        : null;
      const granted = plan?.sessionsIncluded ?? null;

      if (enrollment.sessionsRemaining === null || granted === null) {
        // Unlimited or untracked: cancelling the pass outright is the only
        // meaningful reversal.
        await db
          .update(enrollments)
          .set({
            status: EnrollmentStatus.CANCELLED,
            cancelledAt: new Date(),
          })
          .where(eq(enrollments.id, enrollment.id));
      } else {
        const remaining = Math.max(0, enrollment.sessionsRemaining - granted);
        await db
          .update(enrollments)
          .set({
            sessionsRemaining: remaining,
            ...(remaining === 0
              ? { status: EnrollmentStatus.CANCELLED, cancelledAt: new Date() }
              : {}),
          })
          .where(eq(enrollments.id, enrollment.id));
      }
    }
  }

  await notify({
    userId: payment.studentId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: "A payment was corrected",
    body: `Your instructor voided the payment on invoice ${payment.invoiceNo}. Ask them if this looks wrong.`,
    link: "/dashboard/payments",
    email: true,
  });

  return { ok: true };
}

/** Edit the safe fields on a recorded payment: amount, note and date. */
export async function updateOfflinePayment(args: {
  paymentId: string;
  instructorId: string;
  amountPaise: number;
  note: string;
  paidAt: Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, args.paymentId),
  });
  if (!payment) return { ok: false, error: "Payment not found." };
  if (payment.instructorId !== args.instructorId) {
    return { ok: false, error: "Payment not found." };
  }
  if (payment.method !== "OFFLINE") {
    return { ok: false, error: "Only cash payments can be edited here." };
  }
  if (payment.status === PaymentStatus.REFUNDED) {
    return { ok: false, error: "That payment is voided and can't be edited." };
  }

  // What the student bought is deliberately not editable: credits may already
  // have been spent against it, so changing the pass retrospectively would
  // leave the enrolment and the ledger disagreeing about what was sold.
  const base = payment.description.split(" (")[0];

  await db
    .update(payments)
    .set({
      amountPaise: Math.max(0, args.amountPaise),
      description: args.note ? `${base} (${args.note})` : base,
      paidAt: args.paidAt,
    })
    .where(eq(payments.id, payment.id));

  return { ok: true };
}
