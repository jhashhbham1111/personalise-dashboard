"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import {
  bookings,
  classSessions,
  db,
  enrollments,
  instructorProfiles,
  offerings,
  posts,
  pricingPlans,
  scheduleRules,
  users,
  venues,
  videoAssets,
} from "@/db";
import { requireInstructor } from "@/lib/auth";
import { cancelBooking } from "@/lib/booking";
import {
  findStudentByEmail,
  recordAdHocPayment,
  recordOfflinePayment,
  searchStudents,
  updateOfflinePayment,
  voidOfflinePayment,
} from "@/lib/checkout";
import { generatePassCodes, revokePassCode } from "@/lib/pass-codes";
import {
  Attendance,
  BookingStatus,
  ClassMode,
  DISCIPLINES,
  Level,
  NotificationType,
  OfferingType,
  Role,
  SessionStatus,
} from "@/lib/enums";
import { notify } from "@/lib/notify";
import { isValidUpiId, normaliseUpiId } from "@/lib/payment-details";
import { materializeSessions } from "@/lib/scheduling";
import {
  bool,
  clamp,
  commaList,
  fail,
  num,
  ok,
  pickEnum,
  pickFrom,
  str,
  strList,
  type ActionState,
} from "@/lib/actions";
import {
  canonicalCity,
  rupeesToPaise,
  slugify,
  stringifyList,
  tidyTitle,
} from "@/lib/utils";
import { fromDateInput, timeInputToMinutes } from "@/lib/time";

/**
 * Instructor studio server actions.
 *
 * Every action re-derives the caller's instructor profile from the session and
 * checks that the row being edited belongs to them. A studio action must never
 * trust an id coming from the form as proof of ownership.
 */

async function assertOwnsOffering(offeringId: string, instructorId: string) {
  const row = await db.query.offerings.findFirst({
    where: and(
      eq(offerings.id, offeringId),
      eq(offerings.instructorId, instructorId),
    ),
  });
  return row ?? null;
}

/* ------------------------------------------------------------- profile */

export async function saveProfileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();

  const headline = str(form, "headline");
  const city = canonicalCity(str(form, "city"));
  if (headline.length < 10) {
    return fail("Your headline needs a bit more to it.", {
      headline: "A sentence on what you teach and who it's for.",
    });
  }
  if (!city) return fail("Which city are you based in?", { city: "Required." });

  // Checked because a wrong UPI ID fails silently and late: the student scans
  // or types it, their app says "invalid", and the instructor never hears
  // about it — they just don't get paid.
  const upiId = str(form, "upiId");
  if (upiId && !isValidUpiId(upiId)) {
    return fail("That UPI ID doesn't look right.", {
      upiId: "It should look like yourname@bank — check for a typo.",
    });
  }

  await db
    .update(instructorProfiles)
    .set({
      headline,
      city,
      upiId: upiId ? normaliseUpiId(upiId) : null,
      bankDetails: str(form, "bankDetails") || null,
      paymentNote: str(form, "paymentNote") || null,
      bio: str(form, "bio"),
      yearsExperience: num(form, "yearsExperience"),
      disciplines: stringifyList(strList(form, "disciplines")),
      languages: stringifyList(commaList(form, "languages")),
      certifications: stringifyList(commaList(form, "certifications")),
      instagramUrl: str(form, "instagramUrl") || null,
      youtubeUrl: str(form, "youtubeUrl") || null,
      websiteUrl: str(form, "websiteUrl") || null,
    })
    .where(eq(instructorProfiles.id, user.instructorProfileId));

  revalidatePath("/studio/profile");
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
  return ok("Profile saved.");
}

/** Publishing is what makes an instructor visible in the public directory. */
export async function togglePublishedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const publish = bool(form, "publish");

  if (publish) {
    // A suspended account can't publish its way back into the directory.
    const profile = await db.query.instructorProfiles.findFirst({
      where: eq(instructorProfiles.id, user.instructorProfileId),
      columns: { isSuspended: true },
    });
    if (profile?.isSuspended) {
      return fail("Your account is suspended, so your page can't be published.");
    }

    // Publishing an empty profile creates a dead page for students to land on.
    const count = await db.query.offerings.findMany({
      where: and(
        eq(offerings.instructorId, user.instructorProfileId),
        eq(offerings.isActive, true),
      ),
      columns: { id: true },
    });
    if (count.length === 0) {
      return fail("Add at least one class before publishing your page.");
    }
  }

  await db
    .update(instructorProfiles)
    .set({ isPublished: publish })
    .where(eq(instructorProfiles.id, user.instructorProfileId));

  revalidatePath("/studio/profile");
  revalidatePath("/instructors");
  return ok(publish ? "Your page is live." : "Your page is now hidden.");
}

/* ------------------------------------------------------------ offerings */

export async function saveOfferingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const offeringId = str(form, "offeringId");

  // Sentence-cased only when it was typed entirely in one case, so "yoga for
  // beginners" and "YOGA FOR BEGINNERS" both land as "Yoga for beginners"
  // while a deliberately styled name is left alone. Listings put these titles
  // side by side, and one all-lowercase entry among them reads as broken.
  const title = tidyTitle(str(form, "title"));
  const summary = tidyTitle(str(form, "summary"));
  if (title.length < 3) return fail("Give the class a name.", { title: "Required." });
  if (title.length > 120)
    return fail("That class name is too long.", {
      title: "Keep it under 120 characters.",
    });
  if (summary.length < 10)
    return fail("Add a one-line summary.", {
      summary: "One sentence students will see in listings.",
    });
  if (summary.length > 300)
    return fail("That summary is too long.", {
      summary: "Keep it under 300 characters — it appears on cards.",
    });

  const mode = pickEnum(str(form, "mode"), ClassMode, "ONLINE");
  const venueId = str(form, "venueId") || null;
  if (mode !== "ONLINE" && !venueId) {
    return fail("In-person classes need a venue.", {
      venueId: "Pick a venue, or switch the class to online.",
    });
  }

  // Every one of these arrives as a raw FormData string. The forms only ever
  // offer valid options, but a hand-crafted POST could store anything — and an
  // off-list discipline is worse than invalid data: the filter chips are built
  // from DISCIPLINES, so such a class becomes permanently unfilterable while
  // still appearing in listings.
  const values = {
    title,
    summary,
    description: str(form, "description"),
    discipline: pickFrom(str(form, "discipline"), DISCIPLINES, "Yoga"),
    type: pickEnum(str(form, "type"), OfferingType, "GROUP_CLASS"),
    mode,
    level: pickEnum(str(form, "level"), Level, "ALL_LEVELS"),
    // Upper bounds mirror the inputs' own max attributes, which a direct POST
    // skips entirely — an 8-hour cap and 500 seats are already generous.
    durationMin: clamp(num(form, "durationMin", 60), 10, 480),
    capacity: clamp(num(form, "capacity", 20), 1, 500),
    venueId: mode === "ONLINE" ? null : venueId,
    isActive: bool(form, "isActive"),
  };

  if (offeringId) {
    const existing = await assertOwnsOffering(offeringId, user.instructorProfileId);
    if (!existing) return fail("That class doesn't belong to you.");

    await db.update(offerings).set(values).where(eq(offerings.id, offeringId));
    revalidatePath("/studio/offerings");
    revalidatePath(`/studio/offerings/${offeringId}`);
    if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
    return ok("Class saved.");
  }

  // Slugs are part of the public URL and must be unique per instructor.
  const base = slugify(title) || "class";
  let slug = base;
  let n = 1;
  while (
    await db.query.offerings.findFirst({
      where: and(
        eq(offerings.instructorId, user.instructorProfileId),
        eq(offerings.slug, slug),
      ),
    })
  ) {
    slug = `${base}-${++n}`;
  }

  const [created] = await db
    .insert(offerings)
    .values({ ...values, slug, instructorId: user.instructorProfileId })
    .returning();

  revalidatePath("/studio/offerings");
  // Straight into setup rather than the edit page. A new class is useless
  // until it has a price and a time, and the edit page buried both below a
  // long form — instructors created a class, saw a warning they couldn't act
  // on, and left it unsellable.
  redirect(`/studio/offerings/${created.id}/setup`);
}

export async function deleteOfferingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const offeringId = str(form, "offeringId");

  const existing = await assertOwnsOffering(offeringId, user.instructorProfileId);
  if (!existing) return fail("That class doesn't belong to you.");

  // Students may hold passes against this class, so archive rather than delete.
  await db
    .update(offerings)
    .set({ isActive: false })
    .where(eq(offerings.id, offeringId));
  await db
    .update(scheduleRules)
    .set({ isActive: false })
    .where(eq(scheduleRules.offeringId, offeringId));

  revalidatePath("/studio/offerings");
  return ok("Class archived. Existing passes still work.");
}

/* ------------------------------------------------------- pricing plans */

export async function savePlanAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const offeringId = str(form, "offeringId");
  const planId = str(form, "planId");

  const existing = await assertOwnsOffering(offeringId, user.instructorProfileId);
  if (!existing) return fail("That class doesn't belong to you.");

  const name = str(form, "name");
  const amount = num(form, "amount");
  if (!name) return fail("Give the pass a name.", { name: "Required." });
  if (amount <= 0)
    return fail("Set a price above zero.", { amount: "Must be more than ₹0." });

  const kind = str(form, "kind") || "PER_SESSION";
  // A monthly pass is unlimited-within-validity; packs carry a session count.
  const sessionsIncluded =
    kind === "MONTHLY" ? null : Math.max(1, num(form, "sessionsIncluded", 1));

  const values = {
    name,
    kind,
    amountPaise: rupeesToPaise(amount),
    sessionsIncluded,
    validityDays: num(form, "validityDays", 30) || null,
    description: str(form, "description") || null,
    isActive: true,
  };

  if (planId) {
    // Scoped to the offering just proven to belong to this instructor.
    // Matching on planId alone let anyone pass their own offeringId alongside
    // a competitor's planId and re-price or rename that competitor's pass.
    const updated = await db
      .update(pricingPlans)
      .set(values)
      .where(
        and(eq(pricingPlans.id, planId), eq(pricingPlans.offeringId, offeringId)),
      );
    if (updated.rowsAffected === 0) return fail("That pass doesn't belong to you.");
  } else {
    const siblings = await db.query.pricingPlans.findMany({
      where: eq(pricingPlans.offeringId, offeringId),
      columns: { id: true },
    });
    await db
      .insert(pricingPlans)
      .values({ ...values, offeringId, sortOrder: siblings.length });
  }

  revalidatePath(`/studio/offerings/${offeringId}`);
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
  return ok(planId ? "Pass updated." : "Pass added.");
}

export async function deletePlanAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const planId = str(form, "planId");
  const offeringId = str(form, "offeringId");

  const existing = await assertOwnsOffering(offeringId, user.instructorProfileId);
  if (!existing) return fail("That class doesn't belong to you.");

  // Students may be mid-pass on this plan, so retire it instead of deleting.
  // Scoped to the owned offering — see savePlanAction.
  const retired = await db
    .update(pricingPlans)
    .set({ isActive: false })
    .where(and(eq(pricingPlans.id, planId), eq(pricingPlans.offeringId, offeringId)));
  if (retired.rowsAffected === 0) return fail("That pass doesn't belong to you.");

  revalidatePath(`/studio/offerings/${offeringId}`);
  return ok("Pass retired. Students already on it keep their sessions.");
}

/* ---------------------------------------------------------------- venues */

export async function saveVenueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const venueId = str(form, "venueId");

  const name = str(form, "name");
  const addressLine = str(form, "addressLine");
  const city = canonicalCity(str(form, "city"));
  if (!name || !addressLine || !city) {
    return fail("Name, address and city are all needed so students can find you.");
  }

  const values = {
    name,
    addressLine,
    city,
    state: str(form, "state"),
    pincode: str(form, "pincode"),
    landmark: str(form, "landmark") || null,
    mapUrl: str(form, "mapUrl") || null,
    isActive: true,
  };

  if (venueId) {
    const owned = await db.query.venues.findFirst({
      where: and(
        eq(venues.id, venueId),
        eq(venues.instructorId, user.instructorProfileId),
      ),
    });
    if (!owned) return fail("That venue doesn't belong to you.");
    await db.update(venues).set(values).where(eq(venues.id, venueId));
  } else {
    await db
      .insert(venues)
      .values({ ...values, instructorId: user.instructorProfileId });
  }

  revalidatePath("/studio/venues");
  return ok(venueId ? "Venue updated." : "Venue added.");
}

export async function deleteVenueAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const venueId = str(form, "venueId");

  const owned = await db.query.venues.findFirst({
    where: and(
      eq(venues.id, venueId),
      eq(venues.instructorId, user.instructorProfileId),
    ),
  });
  if (!owned) return fail("That venue doesn't belong to you.");

  await db.update(venues).set({ isActive: false }).where(eq(venues.id, venueId));
  revalidatePath("/studio/venues");
  return ok("Venue removed.");
}

/* -------------------------------------------------------------- schedule */

export async function saveScheduleRuleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const ruleId = str(form, "ruleId");
  const offeringId = str(form, "offeringId");

  const offering = await assertOwnsOffering(offeringId, user.instructorProfileId);
  if (!offering) return fail("Pick one of your classes.", { offeringId: "Required." });

  const days = strList(form, "daysOfWeek").map(Number).filter((d) => d >= 0 && d <= 6);
  if (days.length === 0) {
    return fail("Pick at least one day of the week.", {
      daysOfWeek: "Choose the days this class runs.",
    });
  }

  const timezone = str(form, "timezone") || "Asia/Kolkata";
  const startDate = fromDateInput(str(form, "startDate"), timezone);
  const endDateRaw = str(form, "endDate");
  const endDate = endDateRaw ? fromDateInput(endDateRaw, timezone) : null;
  if (endDate && endDate < startDate) {
    return fail("The end date is before the start date.", {
      endDate: "Must be after the start date.",
    });
  }

  const mode = str(form, "mode") || offering.mode;
  const venueId = str(form, "venueId") || null;
  if (mode !== "ONLINE" && !venueId) {
    return fail("In-person sessions need a venue.", { venueId: "Pick a venue." });
  }

  const values = {
    offeringId,
    instructorId: user.instructorProfileId,
    daysOfWeek: stringifyList(days),
    startTimeMinutes: timeInputToMinutes(str(form, "startTime") || "06:30"),
    durationMin: Math.max(10, num(form, "durationMin", offering.durationMin)),
    timezone,
    startDate,
    endDate,
    mode,
    venueId: mode === "ONLINE" ? null : venueId,
    isActive: true,
  };

  let targetId = ruleId;
  if (ruleId) {
    const owned = await db.query.scheduleRules.findFirst({
      where: and(
        eq(scheduleRules.id, ruleId),
        eq(scheduleRules.instructorId, user.instructorProfileId),
      ),
    });
    if (!owned) return fail("That schedule doesn't belong to you.");

    await db.update(scheduleRules).set(values).where(eq(scheduleRules.id, ruleId));

    // Editing a pattern must not silently strand sessions on the old one. Drop
    // future sessions nobody has booked; anything with a booking is left alone
    // for the instructor to cancel deliberately.
    const future = await db.query.classSessions.findMany({
      where: and(
        eq(classSessions.scheduleRuleId, ruleId),
        eq(classSessions.status, SessionStatus.SCHEDULED),
      ),
      with: { bookings: { columns: { id: true } } },
    });
    for (const s of future) {
      if (s.startsAt > new Date() && s.bookings.length === 0) {
        await db.delete(classSessions).where(eq(classSessions.id, s.id));
      }
    }
  } else {
    const [created] = await db.insert(scheduleRules).values(values).returning();
    targetId = created.id;
  }

  const created = await materializeSessions(targetId);

  revalidatePath("/studio/schedule");
  revalidatePath("/classes");
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);

  return ok(
    `Schedule saved — ${created} session${created === 1 ? "" : "s"} added to your calendar.`,
  );
}

export async function deleteScheduleRuleAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const ruleId = str(form, "ruleId");

  const owned = await db.query.scheduleRules.findFirst({
    where: and(
      eq(scheduleRules.id, ruleId),
      eq(scheduleRules.instructorId, user.instructorProfileId),
    ),
  });
  if (!owned) return fail("That schedule doesn't belong to you.");

  await db
    .update(scheduleRules)
    .set({ isActive: false })
    .where(eq(scheduleRules.id, ruleId));

  // Remove only unbooked future sessions — booked ones need an explicit
  // cancellation so students get told.
  const future = await db.query.classSessions.findMany({
    where: and(
      eq(classSessions.scheduleRuleId, ruleId),
      eq(classSessions.status, SessionStatus.SCHEDULED),
    ),
    with: { bookings: { columns: { id: true } } },
  });
  let removed = 0;
  let kept = 0;
  for (const s of future) {
    if (s.startsAt > new Date() && s.bookings.length === 0) {
      await db.delete(classSessions).where(eq(classSessions.id, s.id));
      removed++;
    } else if (s.startsAt > new Date()) {
      kept++;
    }
  }

  revalidatePath("/studio/schedule");
  revalidatePath("/classes");
  return ok(
    kept > 0
      ? `Schedule stopped. ${removed} empty session${removed === 1 ? "" : "s"} removed; ${kept} with bookings kept — cancel those individually so students are notified.`
      : `Schedule stopped and ${removed} upcoming session${removed === 1 ? "" : "s"} removed.`,
  );
}

/* --------------------------------------------------------------- sessions */

export async function cancelSessionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const sessionId = str(form, "sessionId");
  const reason = str(form, "reason") || "Cancelled by the instructor.";

  const session = await db.query.classSessions.findFirst({
    where: and(
      eq(classSessions.id, sessionId),
      eq(classSessions.instructorId, user.instructorProfileId),
    ),
    with: { bookings: true },
  });
  if (!session) return fail("That class doesn't belong to you.");

  await db
    .update(classSessions)
    .set({ status: SessionStatus.CANCELLED, cancelReason: reason })
    .where(eq(classSessions.id, sessionId));

  // Cancelling by the instructor always returns the credit, whatever the
  // notice period — the student didn't cause this.
  let released = 0;
  for (const b of session.bookings) {
    if (b.status === BookingStatus.CANCELLED) continue;
    await cancelBooking({
      bookingId: b.id,
      byInstructor: true,
      asSessionId: sessionId,
    });
    released++;
    await notify({
      userId: b.studentId,
      type: NotificationType.CLASS_CANCELLED,
      title: `Class cancelled: ${session.title}`,
      body: reason,
      link: "/dashboard/bookings",
      email: true,
    });
  }

  revalidatePath("/studio/schedule");
  revalidatePath(`/studio/sessions/${sessionId}`);
  revalidatePath(`/classes/${sessionId}`);

  return ok(
    released > 0
      ? `Class cancelled. ${released} student${released === 1 ? "" : "s"} notified and credits returned.`
      : "Class cancelled.",
  );
}

/**
 * Renames a single dated occurrence. A session's title is copied from its
 * offering when the schedule rule materializes it, but after that the two are
 * independent — this lets an instructor give one specific class a one-off
 * title ("Vinyasa — outdoors this week") without renaming the offering (and
 * therefore every other session under it, past and future).
 */
export async function renameSessionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const sessionId = str(form, "sessionId");
  const title = str(form, "title");

  if (title.length < 3) return fail("Give the class a name.", { title: "Required." });

  const session = await db.query.classSessions.findFirst({
    where: and(
      eq(classSessions.id, sessionId),
      eq(classSessions.instructorId, user.instructorProfileId),
    ),
  });
  if (!session) return fail("That class doesn't belong to you.");

  await db
    .update(classSessions)
    .set({ title })
    .where(eq(classSessions.id, sessionId));

  revalidatePath("/studio");
  revalidatePath("/studio/schedule");
  revalidatePath(`/studio/sessions/${sessionId}`);
  revalidatePath(`/classes/${sessionId}`);

  return ok("Class renamed.");
}

export async function markAttendanceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const sessionId = str(form, "sessionId");

  const session = await db.query.classSessions.findFirst({
    where: and(
      eq(classSessions.id, sessionId),
      eq(classSessions.instructorId, user.instructorProfileId),
    ),
    with: { bookings: { columns: { id: true } } },
  });
  if (!session) return fail("That class doesn't belong to you.");

  // The form posts one `attendance:<bookingId>` field per student.
  let marked = 0;
  for (const b of session.bookings) {
    const value = str(form, `attendance:${b.id}`);
    if (
      value === Attendance.ATTENDED ||
      value === Attendance.NO_SHOW ||
      value === Attendance.PENDING
    ) {
      await db
        .update(bookings)
        .set({ attendance: value })
        .where(eq(bookings.id, b.id));
      marked++;
    }
  }

  // Marking the register on a finished class closes it out.
  if (session.endsAt < new Date() && session.status === SessionStatus.SCHEDULED) {
    await db
      .update(classSessions)
      .set({ status: SessionStatus.COMPLETED })
      .where(eq(classSessions.id, sessionId));
  }

  revalidatePath(`/studio/sessions/${sessionId}`);
  return ok(`Register saved for ${marked} student${marked === 1 ? "" : "s"}.`);
}

/** Instructor removes a student from a class — always penalty-free. */
export async function removeBookingAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const bookingId = str(form, "bookingId");
  const sessionId = str(form, "sessionId");

  const session = await db.query.classSessions.findFirst({
    where: and(
      eq(classSessions.id, sessionId),
      eq(classSessions.instructorId, user.instructorProfileId),
    ),
  });
  if (!session) return fail("That class doesn't belong to you.");

  // Scoped to the session just proven to be this instructor's — without it,
  // owning any one class would let them cancel any booking on the platform.
  const result = await cancelBooking({
    bookingId,
    byInstructor: true,
    asSessionId: session.id,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath(`/studio/sessions/${sessionId}`);
  return ok("Student removed and their credit returned.");
}

/* ---------------------------------------------------------------- money */

/** Typeahead for the record-a-payment dialog. */
export async function searchStudentsAction(
  query: string,
): Promise<{ id: string; name: string; email: string; phone: string | null; known: boolean }[]> {
  const user = await requireInstructor();
  return searchStudents({ query, instructorId: user.instructorProfileId });
}

export async function recordOfflinePaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();

  // The dialog resolves the person to an id before submitting, so the wrong
  // student can't be enrolled by a name collision. The email fallback keeps
  // the flow usable if the picker can't reach the server.
  const studentId = str(form, "studentId");
  const email = str(form, "studentEmail");
  const amount = num(form, "amount");
  const custom = str(form, "planId") === "__custom__";

  if (amount <= 0) {
    return fail("Enter the amount you were paid.", { amount: "Required." });
  }

  let student: { id: string; name: string } | null = null;
  if (studentId) {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, studentId), eq(users.role, Role.STUDENT)),
      columns: { id: true, name: true },
    });
    student = row ?? null;
  } else if (email) {
    student = await findStudentByEmail(email);
  }

  if (!student) {
    return fail(
      "Pick a student from the list. If they're not there they haven't signed up yet — send them your public page link first.",
      { student: "No account found." },
    );
  }

  if (custom) {
    const label = str(form, "customLabel");
    const offeringId = str(form, "customOfferingId");
    if (!label) {
      return fail("Give the pass a name.", { customLabel: "Required." });
    }
    if (!offeringId) {
      return fail("Pick which class this pass is for.", {
        customOfferingId: "Required.",
      });
    }
    const rawSessions = str(form, "customSessions");
    const rawValidity = str(form, "customValidity");

    const result = await recordAdHocPayment({
      studentId: student.id,
      instructorId: user.instructorProfileId,
      offeringId,
      label,
      amountPaise: rupeesToPaise(amount),
      // Blank means unlimited within the validity window, matching how a
      // monthly plan behaves.
      sessionsIncluded: rawSessions ? Math.max(1, Number(rawSessions)) : null,
      validityDays: rawValidity ? Math.max(1, Number(rawValidity)) : null,
      note: str(form, "note") || undefined,
    });
    if (!result.ok) return fail(result.error);

    revalidatePath("/studio/payments");
    revalidatePath("/studio/students");
    return ok(`Payment recorded — ${student.name}'s pass is active.`);
  }

  const planId = str(form, "planId");
  if (!planId) return fail("Pick which pass they bought.");

  const plan = await db.query.pricingPlans.findFirst({
    where: eq(pricingPlans.id, planId),
    with: { offering: { columns: { id: true, instructorId: true } } },
  });
  if (!plan || plan.offering.instructorId !== user.instructorProfileId) {
    return fail("That pass doesn't belong to you.");
  }

  const result = await recordOfflinePayment({
    studentId: student.id,
    instructorId: user.instructorProfileId,
    offeringId: plan.offering.id,
    planId,
    amountPaise: rupeesToPaise(amount),
    note: str(form, "note") || undefined,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/studio/payments");
  revalidatePath("/studio/students");
  return ok(`Payment recorded — ${student.name}'s pass is active.`);
}

export async function updatePaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const amount = num(form, "amount");
  if (amount <= 0) return fail("Enter an amount.", { amount: "Required." });

  const paidAtRaw = str(form, "paidAt");
  const paidAt = paidAtRaw
    ? fromDateInput(paidAtRaw, user.timezone)
    : new Date();

  const result = await updateOfflinePayment({
    paymentId: str(form, "paymentId"),
    instructorId: user.instructorProfileId,
    amountPaise: rupeesToPaise(amount),
    note: str(form, "note"),
    paidAt,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/studio/payments");
  return ok("Payment updated.");
}

export async function voidPaymentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();

  const result = await voidOfflinePayment({
    paymentId: str(form, "paymentId"),
    instructorId: user.instructorProfileId,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/studio/payments");
  revalidatePath("/studio/students");
  return ok("Payment voided and the pass adjusted.");
}

/* ------------------------------------------------------------ pass codes */

/**
 * Carries the freshly-minted codes back to the UI.
 *
 * This used to return only a count — "50 codes created." — and drop the codes
 * on the floor, leaving the instructor to hunt them out of a paginated table
 * and copy them one at a time. Handing them straight back is what makes a
 * batch of fifty usable.
 */
export type GenerateCodesState = ActionState & { codes?: string[] };

export async function generatePassCodesAction(
  _prev: GenerateCodesState,
  form: FormData,
): Promise<GenerateCodesState> {
  const user = await requireInstructor();

  const planId = str(form, "planId");
  if (!planId) return fail("Pick which pass these codes are for.");

  const quantity = Math.max(1, num(form, "quantity", 1));
  const expiryRaw = str(form, "expiresInDays");

  const result = await generatePassCodes({
    instructorId: user.instructorProfileId,
    planId,
    quantity,
    expiresInDays: expiryRaw ? Number(expiryRaw) : null,
    note: str(form, "note") || undefined,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/studio/codes");
  return {
    success: `${result.codes.length} code${result.codes.length === 1 ? "" : "s"} created.`,
    codes: result.codes,
  };
}

export async function revokePassCodeAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();

  const result = await revokePassCode({
    instructorId: user.instructorProfileId,
    codeId: str(form, "codeId"),
  });
  if (!result.ok) return fail(result.error ?? "Couldn't revoke that code.");

  revalidatePath("/studio/codes");
  return ok("Code revoked.");
}

/* ---------------------------------------------------------------- media */

export async function saveVideoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const videoId = str(form, "videoId");

  const title = str(form, "title");
  const url = str(form, "url");
  if (!title) return fail("Give the video a title.", { title: "Required." });
  if (!/^https?:\/\//.test(url)) {
    return fail("Paste a full video URL.", {
      url: "Must start with http:// or https://",
    });
  }

  const offeringId = str(form, "offeringId") || null;
  if (offeringId) {
    const owned = await assertOwnsOffering(offeringId, user.instructorProfileId);
    if (!owned) return fail("That class doesn't belong to you.");
  }

  const values = {
    title,
    url,
    description: str(form, "description") || null,
    type: str(form, "type") || "VLOG",
    visibility: str(form, "visibility") || "PUBLIC",
    thumbnailUrl: str(form, "thumbnailUrl") || null,
    durationSec: num(form, "durationSec") || null,
    offeringId,
  };

  if (videoId) {
    const owned = await db.query.videoAssets.findFirst({
      where: and(
        eq(videoAssets.id, videoId),
        eq(videoAssets.instructorId, user.instructorProfileId),
      ),
    });
    if (!owned) return fail("That video doesn't belong to you.");
    await db.update(videoAssets).set(values).where(eq(videoAssets.id, videoId));
  } else {
    await db
      .insert(videoAssets)
      .values({ ...values, instructorId: user.instructorProfileId });
  }

  revalidatePath("/studio/media");
  revalidatePath("/videos");
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
  return ok(videoId ? "Video updated." : "Video published.");
}

export async function deleteVideoAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const videoId = str(form, "videoId");

  const owned = await db.query.videoAssets.findFirst({
    where: and(
      eq(videoAssets.id, videoId),
      eq(videoAssets.instructorId, user.instructorProfileId),
    ),
  });
  if (!owned) return fail("That video doesn't belong to you.");

  await db.delete(videoAssets).where(eq(videoAssets.id, videoId));
  revalidatePath("/studio/media");
  revalidatePath("/videos");
  return ok("Video removed.");
}

/* -------------------------------------------------------------- updates */

export async function savePostAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const postId = str(form, "postId");

  const title = str(form, "title");
  const body = str(form, "body");
  if (!title) return fail("Give the update a headline.", { title: "Required." });
  if (body.length < 5) return fail("Write something for your students.", { body: "Required." });

  const values = {
    title,
    body,
    type: str(form, "type") || "DAILY_UPDATE",
    visibility: str(form, "visibility") || "PUBLIC",
  };

  if (postId) {
    const owned = await db.query.posts.findFirst({
      where: and(
        eq(posts.id, postId),
        eq(posts.instructorId, user.instructorProfileId),
      ),
    });
    if (!owned) return fail("That update doesn't belong to you.");
    await db.update(posts).set(values).where(eq(posts.id, postId));
  } else {
    await db
      .insert(posts)
      .values({ ...values, instructorId: user.instructorProfileId });

    // Tell the people who've actually enrolled — that's who an update is for.
    if (bool(form, "notifyStudents")) {
      const students = await db
        .selectDistinct({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.instructorId, user.instructorProfileId),
            eq(enrollments.status, "ACTIVE"),
          ),
        );
      for (const s of students) {
        await notify({
          userId: s.studentId,
          type: NotificationType.NEW_UPDATE,
          title: `${user.name} posted an update`,
          body: title,
          link: user.instructorSlug ? `/i/${user.instructorSlug}` : "/dashboard",
        });
      }
    }
  }

  revalidatePath("/studio/updates");
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
  return ok(postId ? "Update saved." : "Update posted.");
}

export async function deletePostAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireInstructor();
  const postId = str(form, "postId");

  const owned = await db.query.posts.findFirst({
    where: and(
      eq(posts.id, postId),
      eq(posts.instructorId, user.instructorProfileId),
    ),
  });
  if (!owned) return fail("That update doesn't belong to you.");

  await db.delete(posts).where(eq(posts.id, postId));
  revalidatePath("/studio/updates");
  if (user.instructorSlug) revalidatePath(`/i/${user.instructorSlug}`);
  return ok("Update deleted.");
}
