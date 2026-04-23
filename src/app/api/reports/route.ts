import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await prisma.liveSession.findMany({
    where: { teacherId: userId },
    orderBy: { startedAt: "desc" },
    include: {
      quiz: { select: { title: true } },
      participants: {
        select: { id: true, displayName: true, score: true, cheatFlags: true },
      },
    },
  });

  return NextResponse.json(sessions);
}
