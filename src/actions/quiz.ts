"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import fs from "fs";
import path from "path";


export async function fetchQuizEditorData(quizId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });

  if (!quiz) throw new Error("Quiz not found");
  if (quiz.teacherId !== session.user.id) throw new Error("Unauthorized access to this quiz");

  return quiz;
}

export async function saveQuizData(quizId: string, quizData: any, questionsData: any[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (quiz?.teacherId !== session.user.id) throw new Error("Unauthorized");

  await prisma.quiz.update({
    where: { id: quizId },
    data: {
      title: quizData.title,
      description: quizData.description,
    }
  });

  // Upsert questions
  for (const q of questionsData) {
    if (q._isNew) {
      await prisma.question.create({
        data: {
          quizId: quizId,
          questionText: q.question_text,
          questionType: q.question_type,
          timeLimit: q.time_limit,
          basePoints: q.base_points,
          options: q.options,
          orderIndex: q.order_index,
        }
      });
    } else {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          questionText: q.question_text,
          questionType: q.question_type,
          timeLimit: q.time_limit,
          basePoints: q.base_points,
          options: q.options,
          orderIndex: q.order_index,
        }
      });
    }
  }

  return { success: true };
}

export async function deleteQuestionAction(questionId: string) {
  const session = await auth();
  if (!session?.user) return;
  await prisma.question.delete({ where: { id: questionId } });
}

export async function uploadQuizImage(quizId: string, questionId: string, base64Data: string, mimeType: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const extension = mimeType.split('/')[1] || 'png';
  const fileName = `${questionId}-${Date.now()}.${extension}`;
  
  // Ensure the directory exists
  const uploadDir = path.join(process.cwd(), "public", "uploads", "quizzes", quizId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filePath = path.join(uploadDir, fileName);
  
  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  fs.writeFileSync(filePath, buffer);

  return `/uploads/quizzes/${quizId}/${fileName}`;
}
