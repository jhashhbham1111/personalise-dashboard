import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { COMMON_TIMEZONES } from "@/lib/time";
import { str } from "@/lib/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Settings" };

async function saveSettings(form: FormData) {
  "use server";
  const { requireUser: ru } = await import("@/lib/auth");
  const { revalidatePath } = await import("next/cache");
  const user = await ru("/dashboard/settings");

  await db
    .update(users)
    .set({
      name: str(form, "name") || user.name,
      phone: str(form, "phone") || null,
      timezone: str(form, "timezone") || user.timezone,
    })
    .where(eq(users.id, user.id));

  revalidatePath("/dashboard/settings");
}

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader
        title="Settings"
        description="Your timezone decides how every class time on the site is shown to you."
      />

      <Card className="p-5">
        <form action={saveSettings} className="space-y-4">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" defaultValue={row?.name} required />
          </Field>

          <Field label="Email" htmlFor="email">
            <Input id="email" value={row?.email} disabled />
          </Field>

          <Field label="Phone" htmlFor="phone" hint="optional">
            <Input
              id="phone"
              name="phone"
              defaultValue={row?.phone ?? ""}
              placeholder="+91 98765 43210"
            />
          </Field>

          <Field label="Timezone" htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={row?.timezone}>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>

          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
