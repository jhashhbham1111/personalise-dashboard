import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { count } from "drizzle-orm";

import { db, notifications, users } from "@/db";
import { env } from "./env";
import type { NotificationType } from "./enums";

/**
 * Notifications land in two places: always an in-app row (the bell menu), and
 * optionally an email. Email goes through a small provider interface so local
 * development stays quiet and dependency-free.
 */

type EmailInput = { to: string; subject: string; body: string };

interface EmailProvider {
  send(input: EmailInput): Promise<void>;
}

const consoleEmail: EmailProvider = {
  async send({ to, subject }) {
    console.log(`[email:mock] → ${to} :: ${subject}`);
  },
};

const resendEmail: EmailProvider = {
  async send({ to, subject, body }) {
    if (!env.resendApiKey) throw new Error("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.fromEmail, to, subject, text: body }),
    });
    // A rejected send resolves with a 4xx like any other fetch. Without this
    // check, a bad API key or an unverified sending domain meant every email
    // silently vanished while the whole app reported success.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend rejected the email (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
  },
};

function emailProvider(): EmailProvider {
  return env.notifyProvider === "resend" ? resendEmail : consoleEmail;
}

/**
 * Send an email that has no in-app counterpart.
 *
 * Password reset is the case this exists for: the recipient can't sign in, so
 * a notification row they'd never see is worse than useless. Throws on failure
 * rather than swallowing, because unlike a receipt, a reset link that didn't
 * arrive leaves the person stuck.
 */
export async function sendEmail(input: EmailInput): Promise<void> {
  await emailProvider().send(input);
}

export async function notify(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  email?: boolean;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link ?? null,
  });

  if (args.email) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, args.userId))
      .limit(1);
    if (user) {
      // A mail failure must never break the action that triggered it — a
      // booking is still a booking if the receipt didn't send. But it does get
      // logged: silently discarding these meant a misconfigured mail provider
      // was invisible until someone complained they never got a reminder.
      await emailProvider()
        .send({ to: user.email, subject: args.title, body: args.body })
        .catch((err) => {
          console.error(
            `[notify] email failed for user=${args.userId} type=${args.type}:`,
            err instanceof Error ? err.message : err,
          );
        });
    }
  }
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function recentNotifications(userId: string, limit = 12) {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: (n, { desc }) => [desc(n.createdAt)],
    limit,
  });
}
