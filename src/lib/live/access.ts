import "server-only";

import { and, eq } from "drizzle-orm";

import { bookings, db } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { BookingStatus, Role, SessionStatus } from "@/lib/enums";
import { getSessionDetail } from "@/lib/queries";
import { isWithinJoinWindow } from "./provider";

export type LiveSessionDetail = NonNullable<
  Awaited<ReturnType<typeof getSessionDetail>>
>;

export type LiveAccessDenied = {
  ok: false;
  reason: "not-found" | "offline" | "cancelled" | "finished" | "forbidden" | "too-early";
  message: string;
  detail?: LiveSessionDetail;
};

export type LiveAccessGranted = {
  ok: true;
  detail: LiveSessionDetail;
  isHost: boolean;
  booking: { id: string; joinedAt: Date | null } | null;
};

export type LiveAccessResult = LiveAccessGranted | LiveAccessDenied;

/**
 * The single gate every entry point into a live class goes through — the
 * `/live/[sessionId]` page (to decide what to render) and every `/api/live/*`
 * route (to decide what to allow). Keeping it in one place means the rules
 * for "who can be in this room" can't drift between the page and the API.
 */
export async function getLiveAccess(
  sessionId: string,
  user: CurrentUser,
): Promise<LiveAccessResult> {
  const detail = await getSessionDetail(sessionId);
  if (!detail) {
    return { ok: false, reason: "not-found", message: "That class doesn't exist." };
  }

  const { session } = detail;
  const isHost =
    user.role === Role.ADMIN ||
    (user.instructorProfileId != null && user.instructorProfileId === session.instructorId);

  if (session.mode === "OFFLINE") {
    return {
      ok: false,
      reason: "offline",
      message: "This is an in-person class — there's no live room for it.",
      detail,
    };
  }

  let booking: { id: string; joinedAt: Date | null } | null = null;
  if (!isHost) {
    const row = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.sessionId, sessionId),
        eq(bookings.studentId, user.id),
        eq(bookings.status, BookingStatus.CONFIRMED),
      ),
      columns: { id: true, joinedAt: true },
    });
    if (!row) {
      return {
        ok: false,
        reason: "forbidden",
        message: "You don't have a confirmed booking for this class.",
        detail,
      };
    }
    booking = row;
  }

  if (session.status === SessionStatus.CANCELLED) {
    return {
      ok: false,
      reason: "cancelled",
      message: session.cancelReason ?? "This class was cancelled.",
      detail,
    };
  }
  if (session.status === SessionStatus.COMPLETED) {
    return {
      ok: false,
      reason: "finished",
      message: "This class has already ended.",
      detail,
    };
  }

  const now = new Date();
  if (!isWithinJoinWindow(session.startsAt, session.endsAt, now)) {
    if (now < session.startsAt) {
      return {
        ok: false,
        reason: "too-early",
        message: "The room isn't open yet.",
        detail,
      };
    }
    return {
      ok: false,
      reason: "finished",
      message: "This class has already ended.",
      detail,
    };
  }

  return { ok: true, detail, isHost, booking };
}
