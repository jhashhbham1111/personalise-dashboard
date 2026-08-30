/**
 * Demo data.
 *
 * Run with `npm run db:seed` (or `npm run db:reset` to rebuild from scratch).
 * Kept deliberately small — one instructor, one student — so a first-time
 * visitor sees a believable, uncluttered account rather than a marketplace
 * full of random-looking fixtures. Every screen still has real content:
 * classes in the past and the future, an active pass, paid and pending fees,
 * a recording, and a couple of updates.
 *
 * Demo logins (password for every account: `password123`)
 *   admin@personalise.app       platform admin
 *   ananya@personalise.app      instructor — yoga, Bengaluru
 *   student@personalise.app     student with an active pass and bookings
 */

import "dotenv/config";
import bcrypt from "bcryptjs";

import { db } from "./index";
import {
  availabilityExceptions,
  bookings,
  classSessions,
  enrollments,
  instructorProfiles,
  notifications,
  offerings,
  payments,
  posts,
  pricingPlans,
  moderationEvents,
  reviews,
  scheduleRules,
  users,
  venues,
  videoAssets,
} from "./schema";
import { expandRuleOccurrences } from "../lib/recurrence";
import { addDays, addMinutes } from "../lib/time";
import { eq as eqId } from "drizzle-orm";

const PASSWORD = "password123";
const TZ = "Asia/Kolkata";
const now = new Date();

/* Deterministic pseudo-randomness so reseeding gives the same demo story. */
let seedState = 20260812;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function chance(p: number): boolean {
  return rand() < p;
}

function invoiceNo(i: number): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `INV-${yy}${mm}-${String(1000 + i).padStart(6, "0")}`;
}

async function wipe() {
  // Child tables first — SQLite foreign keys are enforced by libSQL.
  await db.delete(moderationEvents);
  await db.delete(notifications);
  await db.delete(reviews);
  await db.delete(payments);
  await db.delete(bookings);
  await db.delete(enrollments);
  await db.delete(videoAssets);
  await db.delete(posts);
  await db.delete(classSessions);
  await db.delete(scheduleRules);
  await db.delete(pricingPlans);
  await db.delete(offerings);
  await db.delete(availabilityExceptions);
  await db.delete(venues);
  await db.delete(instructorProfiles);
  await db.delete(users);
}

async function main() {
  console.log("Seeding Personalise demo data…");
  await wipe();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let invoiceCounter = 0;

  /* ------------------------------------------------------------- accounts */

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@personalise.app",
      name: "Platform Admin",
      passwordHash,
      // Seeded accounts skip the code step — nobody is reading mail at
      // @personalise.app, and a demo login that dead-ends on a verification
      // screen is a broken demo.
      emailVerifiedAt: now,
      role: "ADMIN",
      timezone: TZ,
    })
    .returning();

  const [ananyaUser] = await db
    .insert(users)
    .values({
      email: "ananya@personalise.app",
      name: "Ananya Iyer",
      passwordHash,
      emailVerifiedAt: now,
      role: "INSTRUCTOR",
      timezone: TZ,
      phone: "+91 98765 43210",
    })
    .returning();

  const [ananyaProfile] = await db
    .insert(instructorProfiles)
    .values({
      userId: ananyaUser.id,
      slug: "ananya-iyer",
      headline: "Hatha & Vinyasa yoga for people who sit at desks all day",
      bio: "I've taught yoga for eleven years, the last six of them to software teams in Bengaluru. My classes are unhurried and precise — we spend real time on alignment, because a pose you can hold badly for a minute is worth less than one you can hold well for ten seconds. Mornings are Vinyasa and energising; evenings are slower, with more restorative work for people unwinding after a long day at a screen.",
      disciplines: JSON.stringify(["Yoga", "Meditation"]),
      languages: JSON.stringify(["English", "Hindi", "Tamil"]),
      certifications: JSON.stringify([
        "RYT-500, Yoga Alliance",
        "Yoga Therapy for Back Care, SVYASA",
      ]),
      city: "Bengaluru",
      yearsExperience: 11,
      instagramUrl: "https://instagram.com/ananya.yoga",
      youtubeUrl: "https://youtube.com/@ananyayoga",
      isVerified: true,
      verifiedAt: addDays(now, -30),
      isPublished: true,
    })
    .returning();

  const ananya = {
    userId: ananyaUser.id,
    profileId: ananyaProfile.id,
    name: ananyaUser.name,
    slug: ananyaProfile.slug,
    city: ananyaProfile.city,
  };

  /* The one demo student. */
  const [meera] = await db
    .insert(users)
    .values({
      email: "student@personalise.app",
      name: "Meera Krishnan",
      passwordHash,
      emailVerifiedAt: now,
      role: "STUDENT",
      timezone: TZ,
    })
    .returning();

  /* --------------------------------------------------------------- venues */

  const [shantiStudio] = await db
    .insert(venues)
    .values({
      instructorId: ananya.profileId,
      name: "Shanti Studio, Indiranagar",
      addressLine: "3rd Floor, 412 100 Feet Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      landmark: "Above the Blue Tokai café",
      mapUrl: "https://maps.google.com/?q=Indiranagar+Bengaluru",
    })
    .returning();

  /* ------------------------------------------------------------ offerings */

  type PlanSeed = {
    name: string;
    kind: string;
    amountPaise: number;
    sessionsIncluded: number | null;
    validityDays: number | null;
    description?: string;
  };

  type OfferingSeed = {
    venueId: string | null;
    title: string;
    slug: string;
    discipline: string;
    summary: string;
    description: string;
    type: string;
    mode: string;
    level: string;
    durationMin: number;
    capacity: number;
    plans: PlanSeed[];
    /** days of week + local start time */
    schedule: { days: number[]; startMinutes: number } | null;
  };

  const offeringSeeds: OfferingSeed[] = [
    {
      venueId: null,
      title: "Morning Vinyasa Flow",
      slug: "morning-vinyasa-flow",
      discipline: "Yoga",
      summary: "A brisk 60-minute flow to start the day, online and live at 6:30am.",
      description:
        "We open with ten minutes of breath and joint work, build through two rounds of surya namaskar into a standing sequence, and finish with a short savasana. Modifications are called out for every pose, so a first-timer and someone in their fifth year can take the same class and both be working. Mat, a wall, and enough floor space to lie down is all you need.",
      type: "GROUP_CLASS",
      mode: "ONLINE",
      level: "ALL_LEVELS",
      durationMin: 60,
      capacity: 25,
      plans: [
        {
          name: "Drop-in",
          kind: "PER_SESSION",
          amountPaise: 45000,
          sessionsIncluded: 1,
          validityDays: 30,
          description: "One class, no commitment.",
        },
        {
          name: "10-class pack",
          kind: "PACKAGE",
          amountPaise: 380000,
          sessionsIncluded: 10,
          validityDays: 90,
          description: "Works out to ₹380 a class. Valid for three months.",
        },
        {
          name: "Monthly unlimited",
          kind: "MONTHLY",
          amountPaise: 550000,
          sessionsIncluded: null,
          validityDays: 30,
          description: "Every morning class, as often as you like.",
        },
      ],
      schedule: { days: [1, 3, 5], startMinutes: 6 * 60 + 30 },
    },
    {
      venueId: shantiStudio.id,
      title: "Evening Restorative & Yin",
      slug: "evening-restorative-yin",
      discipline: "Yoga",
      summary: "Slow, propped, floor-based practice at the Indiranagar studio.",
      description:
        "Long holds, plenty of bolsters, and no rush anywhere. This is the class to take when your back is tight from a week of meetings. We use props generously — if the studio doesn't have what you need, say so and we'll build it out of blankets.",
      type: "GROUP_CLASS",
      mode: "OFFLINE",
      level: "ALL_LEVELS",
      durationMin: 75,
      capacity: 12,
      plans: [
        {
          name: "Drop-in",
          kind: "PER_SESSION",
          amountPaise: 60000,
          sessionsIncluded: 1,
          validityDays: 30,
        },
        {
          name: "8-class pack",
          kind: "PACKAGE",
          amountPaise: 420000,
          sessionsIncluded: 8,
          validityDays: 60,
          description: "For the twice-a-week habit.",
        },
      ],
      schedule: { days: [2, 4], startMinutes: 19 * 60 },
    },
    {
      venueId: shantiStudio.id,
      title: "Alignment Intensive Workshop",
      slug: "alignment-intensive",
      discipline: "Yoga",
      summary: "A one-off three-hour deep dive into the five foundational poses.",
      description:
        "Downward dog, chaturanga, warrior II, triangle, and headstand — three hours, five poses, hands-on adjustment for everyone in the room. Capped at eight so there's time for each person.",
      type: "WORKSHOP",
      mode: "OFFLINE",
      level: "INTERMEDIATE",
      durationMin: 180,
      capacity: 8,
      plans: [
        {
          name: "Workshop ticket",
          kind: "PER_SESSION",
          amountPaise: 250000,
          sessionsIncluded: 1,
          validityDays: 60,
        },
      ],
      schedule: null,
    },
  ];

  const createdOfferings: {
    id: string;
    seed: OfferingSeed;
    planIds: { id: string; seed: PlanSeed }[];
  }[] = [];

  for (const seed of offeringSeeds) {
    const [o] = await db
      .insert(offerings)
      .values({
        instructorId: ananya.profileId,
        title: seed.title,
        slug: seed.slug,
        discipline: seed.discipline,
        summary: seed.summary,
        description: seed.description,
        type: seed.type,
        mode: seed.mode,
        level: seed.level,
        durationMin: seed.durationMin,
        capacity: seed.capacity,
        venueId: seed.venueId,
        isActive: true,
      })
      .returning();

    const planRows = await db
      .insert(pricingPlans)
      .values(
        seed.plans.map((p, i) => ({
          offeringId: o.id,
          name: p.name,
          kind: p.kind,
          amountPaise: p.amountPaise,
          sessionsIncluded: p.sessionsIncluded,
          validityDays: p.validityDays,
          description: p.description ?? null,
          sortOrder: i,
        })),
      )
      .returning();

    createdOfferings.push({
      id: o.id,
      seed,
      planIds: planRows.map((r, i) => ({ id: r.id, seed: seed.plans[i] })),
    });
  }

  /* ---------------------------------------------- schedules and sessions */

  // Sessions run from three weeks ago to five weeks ahead, so the app opens with
  // history to look at as well as classes to book.
  const historyStart = addDays(now, -21);
  const horizonEnd = addDays(now, 35);

  const allSessions: {
    id: string;
    offeringId: string;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    mode: string;
    isPast: boolean;
  }[] = [];

  for (const co of createdOfferings) {
    if (!co.seed.schedule) continue;

    const [rule] = await db
      .insert(scheduleRules)
      .values({
        offeringId: co.id,
        instructorId: ananya.profileId,
        daysOfWeek: JSON.stringify(co.seed.schedule.days),
        startTimeMinutes: co.seed.schedule.startMinutes,
        durationMin: co.seed.durationMin,
        timezone: TZ,
        startDate: historyStart,
        endDate: null,
        mode: co.seed.mode,
        venueId: co.seed.venueId,
        lastMaterializedTo: horizonEnd,
      })
      .returning();

    const occurrences = expandRuleOccurrences(
      {
        daysOfWeek: rule.daysOfWeek,
        startTimeMinutes: rule.startTimeMinutes,
        timezone: rule.timezone,
        startDate: rule.startDate,
        endDate: rule.endDate,
      },
      historyStart,
      horizonEnd,
    );

    for (const startsAt of occurrences) {
      const endsAt = addMinutes(startsAt, co.seed.durationMin);
      const isPast = endsAt < now;
      // One cancelled class in the future makes the cancelled state visible.
      const cancelled = !isPast && chance(0.03);

      const [s] = await db
        .insert(classSessions)
        .values({
          offeringId: co.id,
          instructorId: ananya.profileId,
          scheduleRuleId: rule.id,
          title: co.seed.title,
          startsAt,
          endsAt,
          mode: co.seed.mode,
          venueId: co.seed.venueId,
          capacity: co.seed.capacity,
          status: cancelled ? "CANCELLED" : isPast ? "COMPLETED" : "SCHEDULED",
          cancelReason: cancelled ? "Instructor travelling — rescheduled next week." : null,
          liveStartedAt: isPast && co.seed.mode !== "OFFLINE" ? startsAt : null,
          liveEndedAt: isPast && co.seed.mode !== "OFFLINE" ? endsAt : null,
        })
        .returning();

      allSessions.push({
        id: s.id,
        offeringId: co.id,
        startsAt,
        endsAt,
        capacity: co.seed.capacity,
        mode: co.seed.mode,
        isPast,
      });
    }
  }

  // The one-off workshop, three weeks out.
  const workshop = createdOfferings.find((c) => c.seed.slug === "alignment-intensive")!;
  const workshopStart = addMinutes(addDays(now, 21), 0);
  workshopStart.setUTCHours(4, 30, 0, 0); // 10:00 IST
  const [workshopSession] = await db
    .insert(classSessions)
    .values({
      offeringId: workshop.id,
      instructorId: ananya.profileId,
      title: workshop.seed.title,
      startsAt: workshopStart,
      endsAt: addMinutes(workshopStart, 180),
      mode: "OFFLINE",
      venueId: shantiStudio.id,
      capacity: 8,
      status: "SCHEDULED",
    })
    .returning();
  allSessions.push({
    id: workshopSession.id,
    offeringId: workshop.id,
    startsAt: workshopSession.startsAt,
    endsAt: workshopSession.endsAt,
    capacity: 8,
    mode: "OFFLINE",
    isPast: false,
  });

  console.log(`  ${allSessions.length} class sessions`);

  /* --------------------------------------------- enrolments and payments */

  type EnrolRow = {
    id: string;
    offeringId: string;
    status: string;
  };
  const enrolRows: EnrolRow[] = [];

  // Meera is enrolled in everything Ananya teaches — one student, one
  // instructor, but a full set of pass/booking/payment states to look at.
  for (const co of createdOfferings) {
    const plan = pick(co.planIds);
    const startedAt = addDays(now, -Math.floor(rand() * 25) - 3);
    const expiresAt = plan.seed.validityDays
      ? addDays(startedAt, plan.seed.validityDays)
      : null;

    const sessionsRemaining =
      plan.seed.sessionsIncluded === null
        ? null
        : Math.max(
            1,
            plan.seed.sessionsIncluded - Math.floor(rand() * (plan.seed.sessionsIncluded - 1)),
          );

    const [e] = await db
      .insert(enrollments)
      .values({
        studentId: meera.id,
        offeringId: co.id,
        instructorId: ananya.profileId,
        planId: plan.id,
        status: "ACTIVE",
        sessionsRemaining,
        startedAt,
        expiresAt,
      })
      .returning();

    enrolRows.push({ id: e.id, offeringId: co.id, status: e.status });

    // The workshop pass is still awaiting payment, so the fees page has
    // something outstanding to show.
    const pending = co.seed.slug === "alignment-intensive";
    const method = pick(["UPI", "UPI", "CARD"]);
    await db.insert(payments).values({
      studentId: meera.id,
      instructorId: ananya.profileId,
      enrollmentId: e.id,
      invoiceNo: invoiceNo(invoiceCounter++),
      description: `${co.seed.title} — ${plan.seed.name}`,
      amountPaise: plan.seed.amountPaise,
      currency: "INR",
      method,
      provider: "mock",
      providerOrderId: `order_seed_${invoiceCounter}`,
      providerPaymentId: pending ? null : `pay_seed_${invoiceCounter}`,
      status: pending ? "PENDING" : "PAID",
      paidAt: pending ? null : startedAt,
      createdAt: startedAt,
    });
  }

  console.log(`  ${enrolRows.length} enrolments`);

  /* -------------------------------------------------------------- bookings */

  let bookingCount = 0;

  for (const session of allSessions) {
    const enrolment = enrolRows.find(
      (e) => e.offeringId === session.offeringId && e.status === "ACTIVE",
    );
    if (!enrolment) continue;

    // Past classes she mostly attended; future classes she's mostly booked.
    const fillRate = session.isPast ? 0.85 : 0.7;
    if (!chance(fillRate)) continue;

    await db.insert(bookings).values({
      sessionId: session.id,
      studentId: meera.id,
      enrollmentId: enrolment.id,
      status: "CONFIRMED",
      attendance: session.isPast
        ? chance(0.85)
          ? "ATTENDED"
          : "NO_SHOW"
        : "PENDING",
      waitlistPosition: null,
      joinedAt: session.isPast && chance(0.85) ? session.startsAt : null,
      bookedAt: addDays(session.startsAt, -Math.floor(rand() * 6) - 1),
    });
    bookingCount++;
  }

  console.log(`  ${bookingCount} bookings`);

  /* ---------------------------------------------------- videos and updates */

  const videoSeeds = [
    {
      title: "Five minutes to undo a day at the desk",
      description:
        "A short sequence you can do between meetings without changing clothes. Neck, shoulders, upper back.",
      type: "VLOG",
      visibility: "PUBLIC",
      durationSec: 312,
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    },
    {
      title: "How to actually hold chaturanga",
      description:
        "The single most-injured pose in modern yoga, broken down slowly with three ways to scale it.",
      type: "VLOG",
      visibility: "PUBLIC",
      durationSec: 648,
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    },
    {
      title: "Morning Vinyasa — recorded class, week 12",
      description: "Full 60-minute class recording for students who missed the live session.",
      type: "SESSION_RECORDING",
      visibility: "ENROLLED_ONLY",
      durationSec: 3612,
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    },
  ];

  for (const v of videoSeeds) {
    await db.insert(videoAssets).values({
      instructorId: ananya.profileId,
      title: v.title,
      description: v.description,
      type: v.type,
      url: v.url,
      durationSec: v.durationSec,
      visibility: v.visibility,
      viewCount: Math.floor(rand() * 400) + 20,
      publishedAt: addDays(now, -Math.floor(rand() * 20) - 1),
    });
  }

  const postSeeds = [
    {
      title: "No 6:30 class this Friday",
      body: "I'm travelling to a training in Mysore and won't be online on Friday morning. Wednesday runs as normal, and I'll add an extra Saturday session next week to make up for it — it'll show up on the schedule by tonight.",
      type: "ANNOUNCEMENT",
      daysAgo: 1,
    },
    {
      title: "Today: hips, and why they're not actually tight",
      body: "Most people who tell me their hips are tight have hips that are perfectly mobile and glutes that have forgotten how to fire. We're spending today's class on the difference. Bring a block if you have one, a thick book if you don't.",
      type: "DAILY_UPDATE",
      daysAgo: 2,
    },
  ];

  for (const p of postSeeds) {
    await db.insert(posts).values({
      instructorId: ananya.profileId,
      title: p.title,
      body: p.body,
      type: p.type,
      visibility: "PUBLIC",
      publishedAt: addDays(now, -p.daysAgo),
    });
  }

  /* --------------------------------------------------------------- reviews */

  await db.insert(reviews).values({
    studentId: meera.id,
    instructorId: ananya.profileId,
    rating: 5,
    comment:
      "I've taken online yoga from a few different teachers and Ananya is the only one who actually watches and corrects. Worth the 6:30 alarm.",
    createdAt: addDays(now, -14),
  });

  await db
    .update(instructorProfiles)
    .set({ ratingAvg: 500, ratingCount: 1 })
    .where(eqId(instructorProfiles.id, ananya.profileId));

  /* ------------------------------------------------------- notifications */

  await db.insert(notifications).values([
    {
      userId: meera.id,
      type: "CLASS_REMINDER",
      title: "Morning Vinyasa Flow starts soon",
      body: "Your class begins in an hour. The join button appears 15 minutes before.",
      link: "/dashboard/bookings",
      createdAt: addDays(now, -1),
    },
    {
      userId: meera.id,
      type: "NEW_UPDATE",
      title: "Ananya Iyer posted an update",
      body: "No 6:30 class this Friday — Wednesday runs as normal.",
      link: "/i/ananya-iyer",
      createdAt: addDays(now, -1),
    },
    {
      userId: ananya.userId,
      type: "NEW_ENROLLMENT",
      title: "New student enrolled",
      body: "Meera Krishnan just bought a 10-class pack for Morning Vinyasa Flow.",
      link: "/studio/students",
      createdAt: addDays(now, -2),
    },
    {
      userId: ananya.userId,
      type: "PAYMENT_RECEIVED",
      title: "Payment received — ₹3,800",
      body: "10-class pack, paid by UPI.",
      link: "/studio/payments",
      createdAt: addDays(now, -2),
    },
  ]);

  /* The verification that put the badge on Ananya's profile, so the admin
     moderation log isn't empty on first look. */
  await db.insert(moderationEvents).values({
    instructorId: ananya.profileId,
    adminId: admin.id,
    adminName: admin.name,
    action: "VERIFIED",
    note: "Certificates checked against Yoga Alliance register.",
    createdAt: addDays(now, -30),
  });

  /* One blocked day, so the holiday-skipping logic is visible in the studio. */
  const blocked = addDays(now, 10);
  blocked.setUTCHours(0, 0, 0, 0);
  await db.insert(availabilityExceptions).values({
    instructorId: ananya.profileId,
    date: blocked,
    reason: "Teacher training in Mysore",
  });

  console.log("\nDone. Demo logins (password: password123)");
  console.log("  admin@personalise.app     platform admin");
  console.log("  ananya@personalise.app    instructor — yoga");
  console.log("  student@personalise.app   student\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
