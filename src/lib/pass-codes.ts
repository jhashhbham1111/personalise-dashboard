import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  db,
  enrollments,
  offerings,
  passCodes,
  payments,
  pricingPlans,
  users,
} from "@/db";
import { EnrollmentStatus, NotificationType, PaymentStatus, Role } from "./enums";
import {
  formatPassCode,
  normalisePassCode,
  PASS_CODE_LENGTH,
} from "./pass-codes-format";
import { generateInvoiceNo } from "./payments";
import { notify } from "./notify";
import { addDays } from "./time";
import { formatMoney } from "./utils";

/**
 * Pass codes.
 *
 * The instructor generates a batch of codes, hands one to each student who has
 * paid them, and the student redeems it themselves. Before this existed, an
 * instructor with a hundred students had to open the app and activate a pass a
 * hundred times a month, which is the thing that makes offline money collapse
 * at any real scale.
 *
 * A redeemed code writes exactly the same enrolment and PAID payment row that
 * `recordOfflinePayment` does, so the fees ledger stays a single source of
 * truth no matter which route the money came in by.
 */

/**
 * Deliberately excludes 0/O/1/I/L — these get read aloud, written on receipts,
 * and typed by people who did not choose them. Every removed character is a
 * support message that never happens.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = PASS_CODE_LENGTH;

export { formatPassCode, normalisePassCode };

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * Mint `quantity` codes against a plan.
 *
 * The plan's terms are copied onto each code rather than referenced, so editing
 * or retiring the plan later never changes what an already-issued code is worth.
 */
export async function generatePassCodes(args: {
  instructorId: string;
  planId: string;
  quantity: number;
  expiresInDays?: number | null;
  note?: string;
}): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const quantity = Math.max(1, Math.min(100, Math.floor(args.quantity)));

  const plan = await db.query.pricingPlans.findFirst({
    where: eq(pricingPlans.id, args.planId),
    with: { offering: true },
  });
  if (!plan) return { ok: false, error: "That pass no longer exists." };
  if (plan.offering.instructorId !== args.instructorId) {
    return { ok: false, error: "That pass doesn't belong to you." };
  }

  const expiresAt = args.expiresInDays
    ? addDays(new Date(), args.expiresInDays)
    : null;

  const rows: (typeof passCodes.$inferInsert)[] = [];
  const issued: string[] = [];

  for (let i = 0; i < quantity; i++) {
    // Collisions are vanishingly unlikely at 31^8, but a duplicate would throw
    // on the unique index and lose the whole batch, so retry rather than hope.
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await db.query.passCodes.findFirst({
        where: eq(passCodes.code, code),
        columns: { id: true },
      });
      if (!clash && !issued.includes(code)) break;
      code = randomCode();
    }
    issued.push(code);
    rows.push({
      instructorId: args.instructorId,
      offeringId: plan.offeringId,
      planId: plan.id,
      code,
      label: `${plan.offering.title} — ${plan.name}`,
      amountPaise: plan.amountPaise,
      sessionsIncluded: plan.sessionsIncluded,
      validityDays: plan.validityDays,
      note: args.note || null,
      status: "ACTIVE",
      expiresAt,
    });
  }

  await db.insert(passCodes).values(rows);
  return { ok: true, codes: issued };
}

export type PassCodePreview = {
  code: string;
  label: string;
  amountPaise: number;
  sessionsIncluded: number | null;
  validityDays: number | null;
  instructorName: string;
  offeringTitle: string;
};

/** Looks a code up without consuming it, so the student can confirm first. */
export async function previewPassCode(
  input: string,
): Promise<{ ok: true; preview: PassCodePreview } | { ok: false; error: string }> {
  const code = normalisePassCode(input);
  if (code.length !== CODE_LENGTH) {
    return { ok: false, error: "That doesn't look like a valid code." };
  }

  const row = await db.query.passCodes.findFirst({
    where: eq(passCodes.code, code),
    with: {
      offering: true,
      instructor: { with: { user: { columns: { name: true } } } },
    },
  });

  // Same message for "no such code" and "already used" would be friendlier to
  // guessers; these are low-value and instructor-scoped, so clarity wins.
  if (!row) return { ok: false, error: "We couldn't find that code. Check it and try again." };
  if (row.status === "REDEEMED")
    return { ok: false, error: "That code has already been used." };
  if (row.status === "REVOKED")
    return { ok: false, error: "That code is no longer valid. Ask your instructor for a new one." };
  if (row.expiresAt && row.expiresAt < new Date())
    return { ok: false, error: "That code has expired. Ask your instructor for a new one." };

  return {
    ok: true,
    preview: {
      code: row.code,
      label: row.label,
      amountPaise: row.amountPaise,
      sessionsIncluded: row.sessionsIncluded,
      validityDays: row.validityDays,
      instructorName: row.instructor.user.name,
      offeringTitle: row.offering.title,
    },
  };
}

/**
 * Consume a code and grant the pass.
 *
 * The claim is a single conditional UPDATE: two tabs submitting the same code
 * at once must not both get a pass, and a read-then-write check has a gap wide
 * enough to drive several round trips through.
 */
export async function redeemPassCode(args: {
  studentId: string;
  code: string;
}): Promise<
  | { ok: true; enrollmentId: string; offeringId: string; label: string }
  | { ok: false; error: string }
> {
  const student = await db.query.users.findFirst({
    where: eq(users.id, args.studentId),
    columns: { id: true, role: true, name: true },
  });
  if (!student) return { ok: false, error: "Sign in to redeem a code." };
  if (student.role !== Role.STUDENT) {
    return { ok: false, error: "Only student accounts can redeem a pass code." };
  }

  const preview = await previewPassCode(args.code);
  if (!preview.ok) return preview;

  const code = normalisePassCode(args.code);
  const row = await db.query.passCodes.findFirst({
    where: eq(passCodes.code, code),
  });
  if (!row) return { ok: false, error: "We couldn't find that code." };

  const now = new Date();

  // Claim the code first. Whoever loses this race gets the already-used
  // message rather than a second pass.
  const claim = await db.run(sql`
    UPDATE pass_codes
       SET status = 'REDEEMED',
           redeemed_by = ${args.studentId},
           redeemed_at = ${now.getTime()}
     WHERE id = ${row.id}
       AND status = 'ACTIVE'
  `);
  if (claim.rowsAffected === 0) {
    return { ok: false, error: "That code has already been used." };
  }

  // An existing pass for the same class tops up rather than becoming a second
  // one, matching how a recorded cash payment behaves.
  const active = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, args.studentId),
      eq(enrollments.offeringId, row.offeringId),
      eq(enrollments.status, EnrollmentStatus.ACTIVE),
    ),
    orderBy: [desc(enrollments.createdAt)],
  });

  const candidateExpiry = row.validityDays ? addDays(now, row.validityDays) : null;
  let enrollmentId: string;

  if (active && active.sessionsRemaining !== null && row.sessionsIncluded !== null) {
    const nextExpiresAt =
      candidateExpiry && (!active.expiresAt || candidateExpiry > active.expiresAt)
        ? candidateExpiry
        : active.expiresAt;
    await db
      .update(enrollments)
      .set({
        sessionsRemaining: active.sessionsRemaining + row.sessionsIncluded,
        expiresAt: nextExpiresAt,
      })
      .where(eq(enrollments.id, active.id));
    enrollmentId = active.id;
  } else {
    const [created] = await db
      .insert(enrollments)
      .values({
        studentId: args.studentId,
        offeringId: row.offeringId,
        instructorId: row.instructorId,
        planId: row.planId,
        status: EnrollmentStatus.ACTIVE,
        sessionsRemaining: row.sessionsIncluded,
        startedAt: now,
        expiresAt: candidateExpiry,
      })
      .returning();
    enrollmentId = created.id;
  }

  await db
    .update(passCodes)
    .set({ enrollmentId })
    .where(eq(passCodes.id, row.id));

  // The same ledger row a cash payment writes, so Fees stays complete.
  await db.insert(payments).values({
    studentId: args.studentId,
    instructorId: row.instructorId,
    enrollmentId,
    invoiceNo: generateInvoiceNo(),
    description: `${row.label} (pass code ${formatPassCode(row.code)})`,
    amountPaise: row.amountPaise,
    method: "OFFLINE",
    provider: "pass-code",
    status: PaymentStatus.PAID,
    paidAt: now,
  });

  const instructorUser = await db.query.instructorProfiles.findFirst({
    where: (p, { eq: e }) => e(p.id, row.instructorId),
    columns: { userId: true },
  });
  if (instructorUser) {
    await notify({
      userId: instructorUser.userId,
      type: NotificationType.NEW_ENROLLMENT,
      title: `${student.name} redeemed a pass code`,
      body: `${row.label} — ${formatMoney(row.amountPaise)}.`,
      link: "/studio/students",
    });
  }

  await notify({
    userId: args.studentId,
    type: NotificationType.PAYMENT_RECEIVED,
    title: "Your pass is active",
    body: `${row.label} is ready to use. Book your first class whenever you like.`,
    link: "/dashboard/passes",
    email: true,
  });

  return { ok: true, enrollmentId, offeringId: row.offeringId, label: row.label };
}

/** Stops an unredeemed code working — a lost printout, or one handed out by mistake. */
export async function revokePassCode(args: {
  instructorId: string;
  codeId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const result = await db.run(sql`
    UPDATE pass_codes
       SET status = 'REVOKED'
     WHERE id = ${args.codeId}
       AND instructor_id = ${args.instructorId}
       AND status = 'ACTIVE'
  `);
  if (result.rowsAffected === 0) {
    return { ok: false, error: "That code can't be revoked — it may already be used." };
  }
  return { ok: true };
}

/** Codes for the studio list, newest first. */
export async function listPassCodes(instructorId: string, limit = 200) {
  return db
    .select({
      id: passCodes.id,
      code: passCodes.code,
      label: passCodes.label,
      amountPaise: passCodes.amountPaise,
      sessionsIncluded: passCodes.sessionsIncluded,
      status: passCodes.status,
      expiresAt: passCodes.expiresAt,
      redeemedAt: passCodes.redeemedAt,
      redeemerName: users.name,
      createdAt: passCodes.createdAt,
      offeringTitle: offerings.title,
    })
    .from(passCodes)
    .innerJoin(offerings, eq(offerings.id, passCodes.offeringId))
    .leftJoin(users, eq(users.id, passCodes.redeemedBy))
    .where(eq(passCodes.instructorId, instructorId))
    .orderBy(desc(passCodes.createdAt))
    .limit(limit);
}
