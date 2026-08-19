"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { setSuspended, setVerified } from "@/lib/admin";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";
import { pluralize } from "@/lib/utils";

/**
 * Admin moderation actions.
 *
 * Each one re-checks the caller is an admin rather than trusting that the page
 * they came from was guarded — a server action is a public endpoint, and the
 * only thing standing between a form post and someone else's account is this
 * line.
 */

function revalidateEverywhere(slug?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/instructors");
  revalidatePath("/instructors");
  revalidatePath("/classes");
  revalidatePath("/");
  if (slug) revalidatePath(`/i/${slug}`);
}

export async function setVerifiedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const instructorId = str(form, "instructorId");
  const verified = bool(form, "verified");
  if (!instructorId) return fail("Missing instructor.");

  const result = await setVerified({
    instructorId,
    verified,
    admin: { id: admin.id, name: admin.name },
  });
  if (!result.ok) return fail(result.error);

  revalidateEverywhere(str(form, "slug"));
  return ok(verified ? "Instructor verified." : "Verification removed.");
}

export async function setSuspendedAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const instructorId = str(form, "instructorId");
  const suspended = bool(form, "suspended");
  const reason = str(form, "reason");
  if (!instructorId) return fail("Missing instructor.");

  const result = await setSuspended({
    instructorId,
    suspended,
    reason,
    admin: { id: admin.id, name: admin.name },
  });
  if (!result.ok) return fail(result.error, { reason: result.error });

  revalidateEverywhere(str(form, "slug"));

  if (!suspended) return ok("Account reinstated — their page is public again.");

  return ok(
    result.upcomingSessions > 0
      ? `Suspended. Their page is hidden and no new bookings can be made. ${pluralize(result.upcomingSessions, "upcoming class", "upcoming classes")} still on the calendar — cancel individually if those shouldn't run.`
      : "Suspended. Their page is hidden and no new bookings can be made.",
  );
}
