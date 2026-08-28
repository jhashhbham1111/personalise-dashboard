import { Role } from "./enums";

/**
 * The one definition of "the public can see this instructor".
 *
 * Three independent switches, all of which must be on:
 *
 *   isPublished  — the instructor's own decision to be listed
 *   isSuspended  — an admin's decision, which outranks theirs
 *   isVerified   — an admin's decision that this is a real teacher
 *
 * Verification used to be decoration: a badge on a card, and nothing else.
 * An unverified stranger could publish a page and take bookings exactly like a
 * checked instructor, which made the badge meaningless and the marketplace
 * unpoliced. It is now a gate.
 *
 * `publiclyVisibleInstructor` in queries.ts is the SQL half of this rule and
 * must be kept in step — every listing query composes it, and this function
 * covers the page-level checks that operate on an already-loaded row.
 */
export type VisibilityFlags = {
  isPublished: boolean;
  isSuspended: boolean;
  isVerified: boolean;
};

export function instructorIsPublic(profile: VisibilityFlags): boolean {
  return profile.isPublished && !profile.isSuspended && profile.isVerified;
}

/**
 * Who may look at a page the public can't see yet.
 *
 * The instructor themselves, so "View public page" works while they wait for
 * verification and they can see what students will get — and admins, who need
 * to read the page to decide whether to verify it at all. Without this,
 * verification would be a decision made blind.
 */
export function canPreviewInstructor(
  profile: { userId: string },
  viewer: { id: string; role: string } | null,
): boolean {
  if (!viewer) return false;
  return viewer.role === Role.ADMIN || viewer.id === profile.userId;
}

/** Why a page isn't public, phrased for the person who owns it. */
export function visibilityReason(profile: VisibilityFlags): string | null {
  if (profile.isSuspended) return "Your account is suspended, so this page is hidden.";
  if (!profile.isPublished) return "This page is hidden — you haven't published it yet.";
  if (!profile.isVerified) {
    return "Waiting to be verified. Only you can see this page until an admin approves it.";
  }
  return null;
}
