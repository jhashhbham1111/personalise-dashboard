import "server-only";

import { and, asc, eq, gt } from "drizzle-orm";

import {
  chatMessages,
  conversations,
  db,
  enrollments,
  instructorProfiles,
  users,
} from "@/db";
import { NotificationType } from "./enums";
import { notify } from "./notify";

/**
 * Instructor ↔ student messaging.
 *
 * One conversation per pair, created only where an enrolment has ever existed
 * between them — this is the DM that comes with a paid relationship, not an
 * open inbox a stranger can fill. Once a conversation exists it stays open
 * even if the enrolment later lapses or is cancelled: a student who dropped a
 * class can still ask their teacher a question about it, and cutting off an
 * existing thread the moment a pass expires would turn "renew or lose your
 * seat" into "renew or lose your teacher".
 */

async function everEnrolled(studentId: string, instructorId: string): Promise<boolean> {
  const row = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, studentId),
      eq(enrollments.instructorId, instructorId),
    ),
    columns: { id: true },
  });
  return row != null;
}

export type ConversationSummary = {
  conversationId: string;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unread: boolean;
};

/** For a student's inbox: one row per instructor they've ever enrolled with. */
export type StudentConversationRow = ConversationSummary & {
  instructorId: string;
  instructorSlug: string;
  instructorName: string;
  instructorAvatar: string | null;
};

/** For an instructor's inbox: one row per student they've ever taught. */
export type InstructorConversationRow = ConversationSummary & {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
};

/**
 * Every instructor a student has ever enrolled with, each carrying whatever
 * conversation exists (most rows won't have one yet — messaging is opt-in,
 * not started on their behalf). Ordered so an active thread with something
 * unread floats to the top, then by recency, then instructors never messaged.
 */
export async function listConversationsForStudent(
  studentId: string,
): Promise<StudentConversationRow[]> {
  const rows = await db
    .selectDistinct({
      instructorId: instructorProfiles.id,
      instructorSlug: instructorProfiles.slug,
      instructorName: users.name,
      instructorAvatar: users.avatarUrl,
    })
    .from(enrollments)
    .innerJoin(instructorProfiles, eq(instructorProfiles.id, enrollments.instructorId))
    .innerJoin(users, eq(users.id, instructorProfiles.userId))
    .where(eq(enrollments.studentId, studentId));

  const convos = await db
    .select()
    .from(conversations)
    .where(eq(conversations.studentId, studentId));
  const byInstructor = new Map(convos.map((c) => [c.instructorId, c]));

  return rows
    .map((r) => {
      const convo = byInstructor.get(r.instructorId);
      return {
        ...r,
        conversationId: convo?.id ?? "",
        lastMessageAt: convo?.lastMessageAt ?? null,
        lastMessagePreview: convo?.lastMessagePreview ?? null,
        unread: Boolean(
          convo?.lastMessageAt &&
            (!convo.studentReadAt || convo.studentReadAt < convo.lastMessageAt),
        ),
      };
    })
    .sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      const at = a.lastMessageAt?.getTime() ?? 0;
      const bt = b.lastMessageAt?.getTime() ?? 0;
      return bt - at;
    });
}

/** Every student an instructor has ever taught, same shape as above. */
export async function listConversationsForInstructor(
  instructorId: string,
): Promise<InstructorConversationRow[]> {
  const rows = await db
    .selectDistinct({
      studentId: users.id,
      studentName: users.name,
      studentEmail: users.email,
      studentAvatar: users.avatarUrl,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(enrollments.instructorId, instructorId));

  const convos = await db
    .select()
    .from(conversations)
    .where(eq(conversations.instructorId, instructorId));
  const byStudent = new Map(convos.map((c) => [c.studentId, c]));

  return rows
    .map((r) => {
      const convo = byStudent.get(r.studentId);
      return {
        ...r,
        conversationId: convo?.id ?? "",
        lastMessageAt: convo?.lastMessageAt ?? null,
        lastMessagePreview: convo?.lastMessagePreview ?? null,
        unread: Boolean(
          convo?.lastMessageAt &&
            (!convo.instructorReadAt || convo.instructorReadAt < convo.lastMessageAt),
        ),
      };
    })
    .sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      const at = a.lastMessageAt?.getTime() ?? 0;
      const bt = b.lastMessageAt?.getTime() ?? 0;
      return bt - at;
    });
}

export type OpenConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

/**
 * Resolve (creating if needed) the conversation for a pair, gated on an
 * enrolment having ever existed between them.
 *
 * Safe to call every time a thread page loads — creation races on the unique
 * `(instructor_id, student_id)` index, so two tabs opening the same empty
 * thread at once settle on one row rather than two.
 */
export async function openConversation(args: {
  studentId: string;
  instructorId: string;
}): Promise<OpenConversationResult> {
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.instructorId, args.instructorId),
      eq(conversations.studentId, args.studentId),
    ),
  });
  if (existing) return { ok: true, conversationId: existing.id };

  if (!(await everEnrolled(args.studentId, args.instructorId))) {
    return {
      ok: false,
      error: "You can message an instructor once you've enrolled with them.",
    };
  }

  const [created] = await db
    .insert(conversations)
    .values({ instructorId: args.instructorId, studentId: args.studentId })
    .onConflictDoNothing()
    .returning();

  const row =
    created ??
    (await db.query.conversations.findFirst({
      where: and(
        eq(conversations.instructorId, args.instructorId),
        eq(conversations.studentId, args.studentId),
      ),
    }));
  if (!row) return { ok: false, error: "Couldn't open that conversation." };

  return { ok: true, conversationId: row.id };
}

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  senderIsInstructor: boolean;
};

export type ThreadResult =
  | {
      ok: true;
      conversationId: string;
      instructorId: string;
      studentId: string;
      instructorName: string;
      instructorSlug: string;
      studentName: string;
      messages: ThreadMessage[];
    }
  | { ok: false; error: string };

/**
 * Load a thread for one of its two participants, and mark it read for them.
 *
 * `viewerId` is a user id in both cases — checked against the conversation's
 * student, or against the instructor profile's owning user, since a
 * conversation stores an instructor *profile* id but a viewer is a *user*.
 */
export async function loadThread(args: {
  conversationId: string;
  viewerId: string;
}): Promise<ThreadResult> {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, args.conversationId),
    with: {
      instructor: { with: { user: { columns: { id: true, name: true } } } },
      student: { columns: { id: true, name: true } },
    },
  });
  if (!convo) return { ok: false, error: "That conversation doesn't exist." };

  const isStudent = convo.studentId === args.viewerId;
  const isInstructor = convo.instructor.user.id === args.viewerId;
  if (!isStudent && !isInstructor) {
    // Same non-committal message either way — a stranger probing ids
    // shouldn't learn whether a given conversation id is real.
    return { ok: false, error: "That conversation doesn't exist." };
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      senderId: chatMessages.senderId,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convo.id))
    .orderBy(asc(chatMessages.createdAt));

  await db
    .update(conversations)
    .set(isInstructor ? { instructorReadAt: new Date() } : { studentReadAt: new Date() })
    .where(eq(conversations.id, convo.id));

  return {
    ok: true,
    conversationId: convo.id,
    instructorId: convo.instructorId,
    studentId: convo.studentId,
    instructorName: convo.instructor.user.name,
    instructorSlug: convo.instructor.slug,
    studentName: convo.student.name,
    messages: rows.map((r) => ({
      ...r,
      senderIsInstructor: r.senderId === convo.instructor.user.id,
    })),
  };
}

/** New messages only — what the thread's client-side polling asks for. */
export async function loadMessagesSince(args: {
  conversationId: string;
  viewerId: string;
  after: Date;
}): Promise<{ ok: true; messages: ThreadMessage[] } | { ok: false; error: string }> {
  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, args.conversationId),
    with: { instructor: { columns: { userId: true } } },
  });
  if (!convo) return { ok: false, error: "That conversation doesn't exist." };
  if (convo.studentId !== args.viewerId && convo.instructor.userId !== args.viewerId) {
    return { ok: false, error: "That conversation doesn't exist." };
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      senderId: chatMessages.senderId,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, convo.id),
        gt(chatMessages.createdAt, args.after),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));

  if (rows.length > 0) {
    const readField =
      convo.instructor.userId === args.viewerId ? "instructorReadAt" : "studentReadAt";
    await db
      .update(conversations)
      .set({ [readField]: new Date() })
      .where(eq(conversations.id, convo.id));
  }

  return {
    ok: true,
    messages: rows.map((r) => ({
      ...r,
      senderIsInstructor: r.senderId === convo.instructor.userId,
    })),
  };
}

const MAX_MESSAGE_LENGTH = 4000;

export type SendMessageResult =
  | { ok: true; message: ThreadMessage }
  | { ok: false; error: string };

/**
 * Post a message, as whichever side `senderId` turns out to be.
 *
 * The sender's own read marker is bumped alongside `lastMessageAt` — sending
 * a message is itself being caught up on the thread, so it must never leave
 * the sender's own conversation looking unread to them.
 */
export async function sendMessage(args: {
  conversationId: string;
  senderId: string;
  body: string;
}): Promise<SendMessageResult> {
  const body = args.body.trim();
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "That message is too long." };
  }

  const convo = await db.query.conversations.findFirst({
    where: eq(conversations.id, args.conversationId),
    with: {
      instructor: { with: { user: { columns: { id: true, name: true } } } },
      student: { columns: { id: true, name: true } },
    },
  });
  if (!convo) return { ok: false, error: "That conversation doesn't exist." };

  const isInstructor = convo.instructor.user.id === args.senderId;
  const isStudent = convo.studentId === args.senderId;
  if (!isInstructor && !isStudent) {
    return { ok: false, error: "That conversation doesn't exist." };
  }

  const now = new Date();
  const [created] = await db
    .insert(chatMessages)
    .values({ conversationId: convo.id, senderId: args.senderId, body })
    .returning();

  const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview,
      ...(isInstructor ? { instructorReadAt: now } : { studentReadAt: now }),
    })
    .where(eq(conversations.id, convo.id));

  const recipientId = isInstructor ? convo.studentId : convo.instructor.user.id;
  const senderName = isInstructor ? convo.instructor.user.name : convo.student.name;
  const link = isInstructor
    ? `/dashboard/messages/${convo.instructorId}`
    : `/studio/messages/${convo.studentId}`;

  await notify({
    userId: recipientId,
    type: NotificationType.NEW_MESSAGE,
    title: `New message from ${senderName}`,
    body: preview,
    link,
    email: true,
  });

  return {
    ok: true,
    message: { ...created, senderIsInstructor: isInstructor },
  };
}
