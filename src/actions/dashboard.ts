"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";


export async function fetchProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, image: true },
  });
  return user ? { display_name: user.name || "User", role: user.role.toLowerCase() } : null;
}

export async function fetchHistory(userId: string, deviceUuid: string | null) {
  let rows: any[] = [];
  
  if (deviceUuid) {
    rows = await prisma.participant.findMany({
      where: { deviceUuid },
      orderBy: { joinedAt: "desc" },
      take: 20,
      include: {
        session: {
          include: { quiz: { select: { title: true } } }
        }
      }
    });
  }

  if (rows.length === 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.name) {
      rows = await prisma.participant.findMany({
        where: { displayName: user.name },
        orderBy: { joinedAt: "desc" },
        take: 20,
        include: {
          session: {
            include: { quiz: { select: { title: true } } }
          }
        }
      });
    }
  }

  if (rows.length > 0) {
    const sessionIds = Array.from(new Set(rows.map((row) => row.sessionId)));
    const sessionParticipants = await prisma.participant.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { id: true, sessionId: true, score: true },
    });

    const participantsBySession = new Map<string, Array<{ id: string; score: number }>>();
    sessionParticipants.forEach((p) => {
      const list = participantsBySession.get(p.sessionId) || [];
      list.push({ id: p.id, score: p.score || 0 });
      participantsBySession.set(p.sessionId, list);
    });

    participantsBySession.forEach((list, sessionId) => {
      list.sort((a, b) => b.score - a.score);
      participantsBySession.set(sessionId, list);
    });

    return rows.map((row) => {
      const leaderboard = participantsBySession.get(row.sessionId) || [];
      const index = leaderboard.findIndex((p) => p.id === row.id);
      return {
        id: row.id,
        score: row.score,
        session_id: row.sessionId,
        joined_at: row.joinedAt,
        device_uuid: row.deviceUuid,
        display_name: row.displayName,
        live_sessions: row.session ? { quizzes: { title: row.session.quiz.title } } : null,
        rank: index >= 0 ? index + 1 : undefined,
      };
    });
  }

  return rows;
}

export async function fetchQuizzes(userId: string) {
  const quizzes = await prisma.quiz.findMany({
    where: { teacherId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { questions: true }
      }
    }
  });

  return quizzes.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description || "",
    created_at: q.createdAt.toISOString(),
    _count: { questions: q._count.questions }
  }));
}

export async function createNewQuizAction(userId: string) {
  const quiz = await prisma.quiz.create({
    data: {
      title: "Untitled Quiz",
      description: "",
      teacherId: userId,
    }
  });
  return quiz.id;
}

export async function deleteQuizAction(quizId: string) {
  await prisma.quiz.delete({ where: { id: quizId } });
}

export async function startSessionAction(quizId: string, userId: string, joinCode: string) {
  const session = await prisma.liveSession.create({
    data: {
      quizId,
      teacherId: userId,
      joinCode,
      status: "WAITING",
    }
  });
  return session.id;
}

export async function fetchReports(userId: string) {
  const sessions = await prisma.liveSession.findMany({
    where: {
      OR: [
        { teacherId: userId },
        { quiz: { teacherId: userId } }
      ]
    },
    orderBy: { startedAt: "desc" },
    include: {
      quiz: { select: { title: true } },
      participants: {
        select: { id: true, displayName: true, score: true, cheatFlags: true }
      }
    }
  });

  return sessions.map(s => ({
    id: s.id,
    status: s.status.toLowerCase(),
    started_at: s.startedAt?.toISOString() || null,
    finished_at: s.finishedAt?.toISOString() || null,
    join_code: s.joinCode,
    quizzes: s.quiz ? { title: s.quiz.title } : null,
    participants: s.participants.map(p => ({
      id: p.id,
      display_name: p.displayName,
      score: p.score,
      cheat_flags: p.cheatFlags,
      is_banned: false 
    }))
  }));
}
