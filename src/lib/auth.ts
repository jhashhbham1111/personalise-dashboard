import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db, instructorProfiles, users } from "@/db";
import { env } from "./env";
import { Role } from "./enums";

const COOKIE_NAME = "personalise_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const secretKey = new TextEncoder().encode(env.authSecret);

export type SessionPayload = {
  userId: string;
  email: string;
  role: Role;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey);

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

async function readSessionToken(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload.userId || !payload.email) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      role: String(payload.role) as Role,
    };
  } catch {
    // Expired or tampered token — treat as signed out.
    return null;
  }
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  timezone: string;
  /** Null until they've entered the code emailed to that address. */
  emailVerifiedAt: Date | null;
  instructorProfileId: string | null;
  instructorSlug: string | null;
};

/**
 * The signed-in user, or null. Cached per-request, so any number of components
 * can call this during one render and the database is only hit once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSessionToken();
  if (!session) return null;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      emailVerifiedAt: users.emailVerifiedAt,
      deletedAt: users.deletedAt,
      profileId: instructorProfiles.id,
      profileSlug: instructorProfiles.slug,
    })
    .from(users)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, users.id))
    .where(eq(users.id, session.userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Deletion destroys the session cookie on the device it was requested from,
  // but the token is self-contained and stays valid for 30 days everywhere
  // else it was ever set. Without this, a deleted account is still signed in
  // on the tablet in the other room.
  if (row.deletedAt) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    avatarUrl: row.avatarUrl,
    timezone: row.timezone,
    emailVerifiedAt: row.emailVerifiedAt,
    instructorProfileId: row.profileId ?? null,
    instructorSlug: row.profileSlug ?? null,
  };
});

/**
 * A signed-in user with a proven email address.
 *
 * The verification check lives here rather than in middleware on purpose: this
 * is the one function every guarded page and every server action already calls
 * to get the current user, so a new page can't forget to opt in. An unverified
 * account holds a session and reaches exactly one screen.
 */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  }
  if (!user.emailVerifiedAt) redirect("/verify-email");
  return user;
}

/**
 * The signed-in user, verified or not.
 *
 * Only for the verification screen itself, which by definition has to render
 * for someone requireUser would bounce. Everything else uses requireUser.
 */
export async function requireUserPendingVerification(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Requires an instructor (or admin) and guarantees the profile exists. */
export async function requireInstructor(): Promise<
  CurrentUser & { instructorProfileId: string }
> {
  const user = await requireUser("/studio");
  if (user.role !== Role.INSTRUCTOR && user.role !== Role.ADMIN) {
    redirect("/dashboard");
  }
  if (!user.instructorProfileId) redirect("/onboarding/instructor");
  return user as CurrentUser & { instructorProfileId: string };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (user.role !== Role.ADMIN) redirect("/dashboard");
  return user;
}

/** Where a user lands after signing in. */
export function homePathForRole(role: Role): string {
  if (role === Role.ADMIN) return "/admin";
  if (role === Role.INSTRUCTOR) return "/studio";
  return "/dashboard";
}
