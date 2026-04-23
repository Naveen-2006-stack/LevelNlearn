import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const { sessionId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: { quiz: { select: { id: true, title: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.teacherId !== userId) {
    return NextResponse.json(
      { error: "Only the host can view this report." },
      { status: 403 }
    );
  }

  const [participants, responses, questions] = await Promise.all([
    prisma.participant.findMany({ where: { sessionId } }),
    prisma.studentResponse.findMany({
      where: { sessionId },
      select: { questionId: true, participantId: true, isCorrect: true },
    }),
    prisma.question.findMany({
      where: { quizId: session.quizId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, questionText: true, orderIndex: true },
    }),
  ]);

  return NextResponse.json({ session, participants, responses, questions });
}
