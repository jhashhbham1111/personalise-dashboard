"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db, instructorProfiles, users } from "@/db";
import {
  createSession,
  destroySession,
  hashPassword,
  homePathForRole,
  verifyPassword,
} from "@/lib/auth";
import { DISCIPLINES, Role } from "@/lib/enums";
import {
  completePasswordReset,
  requestPasswordReset,
} from "@/lib/password-reset";
import { clamp, fail, ok, str, type ActionState } from "@/lib/actions";
import { clearRateLimit, clientIp, rateLimit } from "@/lib/rate-limit";
import { canonicalCity, slugify, tidyPersonName } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Only ever redirect somewhere inside this app.
 *
 * `next` arrives from the query string, so without this a link like
 * `/login?next=https://evil.example` sends someone to an attacker's page the
 * instant they authenticate — which is exactly the moment they're most likely
 * to trust what they see and re-enter a password. Protocol-relative `//host`
 * is rejected too; browsers treat it as absolute.
 */
function safeNext(next: string, fallback: string): string {
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/** Keeps digits and a leading +, so "+91 98765 43210" and "09876543210" match. */
function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus ? "+" : ""}${digits}` : "";
}

export async function loginAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const next = str(form, "next");

  if (!email || !password) return fail("Enter your email and password.");

  // Limited per address and per account: one IP can't spray many accounts,
  // and many IPs can't grind one account. Checked before the bcrypt compare,
  // which is deliberately expensive and would otherwise be the cheap way to
  // load the server.
  const ip = clientIp(await headers());
  for (const [key, limit] of [
    [`login:ip:${ip}`, 30],
    [`login:email:${email}`, 8],
  ] as const) {
    const gate = await rateLimit({ key, limit, windowSeconds: 900 });
    if (!gate.ok) {
      return fail(
        `Too many sign-in attempts. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minute(s).`,
      );
    }
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  // Same message either way — don't leak which emails have accounts.
  //
  // A deleted account is refused with that same message rather than "this
  // account was deleted": the scrubbed row keeps its role and its ledger
  // history, and telling a stranger which addresses used to be accounts is the
  // same enumeration leak as telling them which ones are. Its passwordHash is
  // already a value bcrypt can never match, so this is the second lock.
  if (!user || user.deletedAt || !(await verifyPassword(password, user.passwordHash))) {
    return fail("That email and password don't match.");
  }

  await clearRateLimit(`login:email:${email}`);

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role as Role,
  });

  redirect(safeNext(next, homePathForRole(user.role as Role)));
}

export async function signupAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  // Title-cased only when typed in a single case, so "priya sharma" and
  // "PRIYA SHARMA" both become "Priya Sharma" while "Anne-Marie McLeod" keeps
  // the capitals its owner chose. This name is shown to instructors on their
  // register and to other students in class.
  const name = tidyPersonName(str(form, "name"));
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const intent = str(form, "intent"); // "learn" | "teach"
  // Optional, but the thing an instructor actually knows about a student who
  // just handed them cash — it makes them findable without an exact email.
  const phone = normalisePhone(str(form, "phone"));

  const fields: Record<string, string> = {};
  if (name.length < 2) fields.name = "Tell us your name.";
  if (!EMAIL_RE.test(email)) fields.email = "That doesn't look like an email address.";
  if (password.length < 8) fields.password = "Use at least 8 characters.";
  if (phone && phone.replace(/\D/g, "").length < 7)
    fields.phone = "That doesn't look like a phone number.";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  // Signup answers "does this email have an account?" truthfully, which makes
  // it an enumeration oracle. Can't fix that without an email-verification
  // flow, so at least cap how fast one address can ask.
  const signupGate = await rateLimit({
    key: `signup:ip:${clientIp(await headers())}`,
    limit: 10,
    windowSeconds: 3600,
  });
  if (!signupGate.ok) {
    return fail("Too many sign-ups from here just now. Try again shortly.");
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return fail("An account with that email already exists.", {
      email: "Already registered — try signing in instead.",
    });
  }

  const role = intent === "teach" ? Role.INSTRUCTOR : Role.STUDENT;

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      phone: phone || null,
      passwordHash: await hashPassword(password),
      role,
    })
    .returning();

  await createSession({ userId: user.id, email: user.email, role });

  redirect(role === Role.INSTRUCTOR ? "/onboarding/instructor" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

/* ---------------------------------------------------------- password reset */

export async function requestPasswordResetAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = str(form, "email");
  if (!EMAIL_RE.test(email)) {
    return fail("Enter the email address on your account.", {
      email: "That doesn't look like an email address.",
    });
  }

  // Rate limited per address and per IP: this endpoint sends mail to an
  // address the caller chose, so without a cap it's a way to have us spam
  // someone else's inbox.
  const ip = clientIp(await headers());
  for (const [key, limit] of [
    [`reset:ip:${ip}`, 10],
    [`reset:email:${email.toLowerCase()}`, 4],
  ] as const) {
    const gate = await rateLimit({ key, limit, windowSeconds: 3600 });
    if (!gate.ok) {
      return fail("Too many reset requests. Try again in an hour.");
    }
  }

  await requestPasswordReset(email);

  // Deliberately the same answer whether or not the account exists — anything
  // else turns this form into a way to test which emails are registered.
  return ok(
    "If that email has an account, a reset link is on its way. It expires in an hour.",
  );
}

export async function completePasswordResetAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = str(form, "token");
  const password = str(form, "password");
  const confirm = str(form, "confirm");

  if (password !== confirm) {
    return fail("Those passwords don't match.", {
      confirm: "Enter the same password twice.",
    });
  }

  const result = await completePasswordReset({ token, password });
  if (!result.ok) return fail(result.error, { password: result.error });

  redirect("/login?reset=1");
}

/**
 * Turns a student account into an instructor account, or completes an
 * instructor signup, by creating the public profile.
 */
export async function createInstructorProfileAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding/instructor");

  const headline = str(form, "headline");
  // Normalised on write so the city dropdown has one entry per city rather
  // than one per spelling — see canonicalCity.
  const city = canonicalCity(str(form, "city"));
  const bio = str(form, "bio");
  // Filtered against the known list rather than trusted: the discipline chips
  // students browse by are built from DISCIPLINES, so anything else stored
  // here is a profile that can never be found through the filter.
  // One discipline per instructor: whatever they pick here is what every
  // class they create inherits, so the class form never has to ask again.
  // Still stored as a JSON array — the instructor filters match on it with
  // a LIKE, and keeping the shape means none of that has to change.
  const disciplines = form
    .getAll("disciplines")
    .map(String)
    .filter((d): d is (typeof DISCIPLINES)[number] =>
      (DISCIPLINES as readonly string[]).includes(d),
    )
    .slice(0, 1);
  const yearsExperience = clamp(Number(str(form, "yearsExperience")) || 0, 0, 80);

  const fields: Record<string, string> = {};
  if (headline.length < 10)
    fields.headline = "A sentence or two on what you teach and who for.";
  if (!city) fields.city = "Which city are you based in?";
  if (disciplines.length === 0) fields.disciplines = "Pick the one you teach.";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);

  const existing = await db.query.instructorProfiles.findFirst({
    where: eq(instructorProfiles.userId, user.id),
  });
  if (existing) redirect("/studio");

  // Slugs are public URLs, so they have to be unique across the platform.
  const base = slugify(user.name) || "instructor";
  let slug = base;
  let n = 1;
  while (
    await db.query.instructorProfiles.findFirst({
      where: eq(instructorProfiles.slug, slug),
    })
  ) {
    slug = `${base}-${++n}`;
  }

  await db.insert(instructorProfiles).values({
    userId: user.id,
    slug,
    headline,
    bio,
    city,
    disciplines: JSON.stringify(disciplines),
    languages: JSON.stringify(["English"]),
    certifications: JSON.stringify([]),
    yearsExperience,
    isPublished: false,
    isVerified: false,
  });

  if (user.role === Role.STUDENT) {
    await db
      .update(users)
      .set({ role: Role.INSTRUCTOR })
      .where(eq(users.id, user.id));
    await createSession({
      userId: user.id,
      email: user.email,
      role: Role.INSTRUCTOR,
    });
  }

  redirect("/studio?welcome=1");
}
