import type { Metadata, Viewport } from "next";
import { and, asc, eq } from "drizzle-orm";

import { bookings, db, users } from "@/db";
import { requireUser } from "@/lib/auth";
import { BookingStatus, Role } from "@/lib/enums";
import { getLiveAccess } from "@/lib/live/access";
import { formatLongDate } from "@/lib/time";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveRoom } from "@/components/live/room";
import { OpenSoon } from "@/components/live/open-soon";
import type { SimPeer } from "@/components/live/types";

export const metadata: Metadata = { title: "Live class" };

/**
 * Scoped to this route rather than the root layout, because both settings only
 * make sense for a screen that owns the whole viewport.
 *
 * `viewportFit: "cover"` is what makes `env(safe-area-inset-bottom)` report a
 * real number — without it the control bar's safe-area padding silently
 * computes to 0 and the buttons sit under the phone's home indicator.
 *
 * `interactiveWidget: "resizes-content"` shrinks the layout viewport when the
 * on-screen keyboard opens, so `100dvh` accounts for it and the chat sheet
 * rides above the keyboard instead of being covered by it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function LivePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser(`/live/${sessionId}`);
  const fallbackBack = user.role === Role.INSTRUCTOR || user.role === Role.ADMIN ? "/studio" : "/dashboard/bookings";

  const access = await getLiveAccess(sessionId, user);

  if (!access.ok) {
    if (access.reason === "too-early") {
      return (
        <DeniedShell backHref={fallbackBack}>
          <h1 className="text-xl font-semibold text-ink">The room isn&apos;t open yet</h1>
          <p className="mt-2 text-sm text-ink-soft">
            It opens 15 minutes before{" "}
            {formatLongDate(access.detail!.session.startsAt, user.timezone)}.
          </p>
          <OpenSoon
            opensAtISO={new Date(
              access.detail!.session.startsAt.getTime() - 15 * 60_000,
            ).toISOString()}
          />
        </DeniedShell>
      );
    }

    const heading: Record<typeof access.reason, string> = {
      "not-found": "Class not found",
      offline: "This is an in-person class",
      cancelled: "This class was cancelled",
      finished: "This class has ended",
      forbidden: "You don't have access to this class",
    };

    return (
      <DeniedShell backHref={fallbackBack}>
        <h1 className="text-xl font-semibold text-ink">{heading[access.reason]}</h1>
        <p className="mt-2 text-sm text-ink-soft">{access.message}</p>
      </DeniedShell>
    );
  }

  const { detail, isHost } = access;
  const session = detail.session;

  let peers: SimPeer[];
  if (isHost) {
    const roster = await db
      .select({ id: users.id, name: users.name })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.studentId))
      .where(
        and(eq(bookings.sessionId, sessionId), eq(bookings.status, BookingStatus.CONFIRMED)),
      )
      .orderBy(asc(bookings.bookedAt))
      .limit(6);
    peers = roster.map((r) => ({ identity: r.id, name: r.name, isHost: false }));
  } else {
    peers = [{ identity: detail.instructorUserId, name: detail.instructorName, isHost: true }];
  }

  const backHref = isHost ? `/studio/sessions/${session.id}` : "/dashboard/bookings";

  return (
    <LiveRoom sessionId={session.id} title={session.title} isHost={isHost} peers={peers} backHref={backHref} />
  );
}

function DeniedShell({
  children,
  backHref,
}: {
  children: React.ReactNode;
  backHref: string;
}) {
  return (
    // `min-h-dvh`, not `min-h-screen`: on mobile Chrome and Safari `100vh` is
    // the viewport *with the URL bar collapsed*, so a centred card is pushed
    // partly under the browser chrome until you scroll.
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
      <Card className="w-full max-w-sm p-6 text-center">
        {children}
        <ButtonLink href={backHref} variant="secondary" className="mt-5 min-h-11">
          Back
        </ButtonLink>
      </Card>
    </div>
  );
}
