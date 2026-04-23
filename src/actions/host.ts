"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher";

export async function hostFetchSessionAction(sessionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const liveSession = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: { questions: { orderBy: { orderIndex: "asc" } } }
      },
      participants: true,
    }
  });

  if (!liveSession || liveSession.teacherId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  return liveSession;
}

export async function hostStartGameAction(sessionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const liveSession = await prisma.liveSession.update({
    where: { id: sessionId, teacherId: session.user.id },
    data: {
      status: "ACTIVE",
      startedAt: new Date(),
    }
  });

  await pusherServer.trigger(`session-${sessionId}`, "session-update", {
    status: "ACTIVE"
  });

  return liveSession;
}

export async function hostAdvanceQuestionAction(sessionId: string, nextQuestionIndex: number, isLast: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // Broadcast reveal answer before advancing
  await pusherServer.trigger(`session-${sessionId}`, "reveal_answer", {
    questionIndex: nextQuestionIndex - 1
  });

  await new Promise(r => setTimeout(r, 1400));

  const data: any = {};

  if (isLast) {
    data.status = "FINISHED";
    data.finishedAt = new Date();
  } else {
    data.currentQuestionIndex = nextQuestionIndex;
  }

  const liveSession = await prisma.liveSession.update({
    where: { id: sessionId, teacherId: session.user.id },
    data
  });

  await pusherServer.trigger(`session-${sessionId}`, "session-update", {
    status: data.status || "ACTIVE",
    current_question_index: data.currentQuestionIndex
  });

  return liveSession;
}

export async function hostTerminateQuizAction(sessionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.liveSession.update({
    where: { id: sessionId, teacherId: session.user.id },
    data: {
      status: "FINISHED",
      finishedAt: new Date(),
    }
  });

  await pusherServer.trigger(`session-${sessionId}`, "terminate_session", {});
  await pusherServer.trigger(`session-${sessionId}`, "session-update", {
    status: "FINISHED"
  });
}

export async function hostKickParticipantAction(sessionId: string, participantId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // Increment cheatFlags as a soft "kick" flag since isBanned is not in schema
  await prisma.participant.update({
    where: { id: participantId },
    data: { cheatFlags: { increment: 10 } }
  });

  await pusherServer.trigger(`session-${sessionId}`, "kick_player", {
    targetId: participantId
  });

  await pusherServer.trigger(`session-${sessionId}`, "participant-leave", {
    id: participantId
  });
}

export async function hostGetSubmissionCountAction(sessionId: string, questionId: string) {
  const count = await prisma.studentResponse.count({
    where: { sessionId, questionId }
  });
  return count;
}

// --- Stub actions (features not yet in schema) ---

export async function hostTouchSessionAction(_sessionId: string) {
  // No-op: lastActivityAt field not in current schema.
}

export async function hostFetchViolationsAction(_sessionId: string, _participantId: string) {
  // No-op: ParticipantViolation model not in current schema.
  return [];
}

export async function hostLogViolationAction(_sessionId: string, _participantId: string, _violationType: string) {
  // No-op: ParticipantViolation model not in current schema.
}

