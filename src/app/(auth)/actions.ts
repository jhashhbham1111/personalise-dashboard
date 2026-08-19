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
import { Role } from "@/lib/enums";
import { fail, str, type ActionState } from "@/lib/actions";
import { clearRateLimit, clientIp, rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";

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
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const intent = str(form, "intent"); // "learn" | "teach"

  const fields: Record<string, string> = {};
  if (name.length < 2) fields.name = "Tell us your name.";
  if (!EMAIL_RE.test(email)) fields.email = "That doesn't look like an email address.";
  if (password.length < 8) fields.password = "Use at least 8 characters.";
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
  const city = str(form, "city");
  const bio = str(form, "bio");
  const disciplines = form
    .getAll("disciplines")
    .map(String)
    .filter(Boolean);
  const yearsExperience = Number(str(form, "yearsExperience")) || 0;

  const fields: Record<string, string> = {};
  if (headline.length < 10)
    fields.headline = "A sentence or two on what you teach and who for.";
  if (!city) fields.city = "Which city are you based in?";
  if (disciplines.length === 0) fields.disciplines = "Pick at least one.";
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
