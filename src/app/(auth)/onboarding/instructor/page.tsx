import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your teaching profile" };

export default async function InstructorOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/onboarding/instructor");
  if (user.instructorProfileId) redirect("/studio");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">
        Tell students what you teach
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        This becomes your public page. You can change all of it later, and
        nothing is visible until you choose to publish.
      </p>
      <OnboardingForm />
    </div>
  );
}
