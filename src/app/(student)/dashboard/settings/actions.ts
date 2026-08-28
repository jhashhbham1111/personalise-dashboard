"use server";

import { redirect } from "next/navigation";

import { deleteAccount } from "@/lib/account-deletion";
import { destroySession, requireUser } from "@/lib/auth";
import { fail, str, type ActionState } from "@/lib/actions";

/**
 * Delete (anonymise) the signed-in account.
 *
 * The typed confirmation is checked here as well as in the dialog: the dialog's
 * disabled button is a convenience, and a server action is a public endpoint
 * that anyone can POST to directly.
 */
export async function deleteAccountAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard/settings");

  const typed = str(form, "confirmEmail").toLowerCase();
  if (typed !== user.email.toLowerCase()) {
    return fail("That's not the email on this account.", {
      confirmEmail: "Type your email address exactly as it's shown above.",
    });
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) return fail(result.error);

  // The cookie still carries a valid signed token for a user id that no longer
  // belongs to anyone, so it has to go before we navigate anywhere.
  await destroySession();
  redirect("/login?deleted=1");
}
