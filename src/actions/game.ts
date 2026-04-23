"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { pusherServer } from "@/lib/pusher";

// Teacher actions

export async function fetchHostSession(sessionId: string) {
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
    throw new Error("Session not found or unauthorized");
  }

  return liveSession;
}

export async function updateSessionStatusAction(sessionId: string, status: string, questionIndex?: number) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const data: any = { status };
  if (questionIndex !== undefined) data.currentQuestionIndex = questionIndex;
  if (status === "ACTIVE") data.startedAt = new Date();
  if (status === "FINISHED") data.finishedAt = new Date();

  await prisma.liveSession.update({
    where: { id: sessionId, teacherId: session.user.id },
    data
  });

  // Trigger pusher event to all clients
  await pusherServer.trigger(`session-${sessionId}`, 'session-update', {
    status,
    current_question_index: questionIndex
  });
}

export async function kickParticipantAction(sessionId: string, participantId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) return;

  // Mark as banned/kicked. Wait, the schema doesn't have `isBanned`. I'll just delete them.
  await prisma.participant.delete({ where: { id: participantId } });

  await pusherServer.trigger(`session-${sessionId}`, 'participant-leave', {
    id: participantId
  });
}

export async function leaveGameAction(sessionId: string, participantId: string, reason: string) {
  const participant = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!participant) return;

  await prisma.participant.delete({ where: { id: participantId } });

  await pusherServer.trigger(`session-${sessionId}`, 'anti_cheat_violation', {
    studentName: participant.displayName,
    studentId: participantId,
    violationType: reason
  });

  await pusherServer.trigger(`session-${sessionId}`, 'participant-leave', {
    id: participantId
  });
}

// Student actions

export async function joinGameAction(joinCode: string, displayName: string, deviceUuid: string) {
  const liveSession = await prisma.liveSession.findUnique({
    where: { joinCode: joinCode.toUpperCase() }
  });

  if (!liveSession) throw new Error("Invalid Room Code");
  if (liveSession.status === "FINISHED") throw new Error("Session has already ended");

  // Upsert participant
  let participant = await prisma.participant.findUnique({
    where: { sessionId_deviceUuid: { sessionId: liveSession.id, deviceUuid } }
  });

  if (participant) {
    participant = await prisma.participant.update({
      where: { id: participant.id },
      data: { displayName, lastActive: new Date() }
    });
  } else {
    participant = await prisma.participant.create({
      data: {
        sessionId: liveSession.id,
        deviceUuid,
        displayName,
      }
    });
  }

  // Trigger pusher event to teacher
  await pusherServer.trigger(`session-${liveSession.id}`, 'participant-join', {
    id: participant.id,
    display_name: participant.displayName,
    score: participant.score,
    streak: participant.streak,
    cheat_flags: participant.cheatFlags,
    device_uuid: participant.deviceUuid,
  });

  return liveSession.id;
}

export async function fetchPlaySession(sessionId: string, deviceUuid: string) {
  const liveSession = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: { questions: { orderBy: { orderIndex: "asc" } } }
      }
    }
  });

  if (!liveSession) throw new Error("Session not found");

  const participant = await prisma.participant.findUnique({
    where: { sessionId_deviceUuid: { sessionId, deviceUuid } }
  });

  if (!participant) throw new Error("Participant not found");

  // Send a keep-alive/rejoin event to teacher
  await pusherServer.trigger(`session-${sessionId}`, 'participant-join', {
    id: participant.id,
    display_name: participant.displayName,
    score: participant.score,
    streak: participant.streak,
    cheat_flags: participant.cheatFlags,
    device_uuid: participant.deviceUuid,
  });

  return { liveSession, participant };
}

export async function submitAnswerAction(
  sessionId: string,
  participantId: string,
  questionId: string,
  reactionTimeMs: number,
  isCorrect: boolean,
  pointsAwarded: number,
  streakBonus: number
) {
  // Save response
  await prisma.studentResponse.create({
    data: {
      sessionId,
      participantId,
      questionId,
      reactionTimeMs,
      isCorrect,
      pointsAwarded,
      streakBonus
    }
  });

  // Update participant score
  const participant = await prisma.participant.update({
    where: { id: participantId },
    data: {
      score: { increment: pointsAwarded + streakBonus },
      streak: isCorrect ? { increment: 1 } : 0,
      lastActive: new Date()
    }
  });

  // Notify teacher via Pusher
  await pusherServer.trigger(`session-${sessionId}`, 'participant-update', {
    id: participant.id,
    display_name: participant.displayName,
    score: participant.score,
    streak: participant.streak,
    cheat_flags: participant.cheatFlags,
  });
}

export async function flagCheatAction(participantId: string, sessionId: string) {
  const participant = await prisma.participant.update({
    where: { id: participantId },
    data: { cheatFlags: { increment: 1 } }
  });

  await pusherServer.trigger(`session-${sessionId}`, 'participant-update', {
    id: participant.id,
    display_name: participant.displayName,
    score: participant.score,
    streak: participant.streak,
    cheat_flags: participant.cheatFlags,
  });
}
