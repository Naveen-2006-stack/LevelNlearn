"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";


export async function registerAction(name: string, email: string, passwordRaw: string) {
  if (!name || !email || !passwordRaw) {
    throw new Error("Missing fields");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  const password = await bcrypt.hash(passwordRaw, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password,
      role: "TEACHER", // Automatically give them teacher role to host quizzes
    },
  });

  return { success: true, user: { id: user.id, email: user.email, name: user.name } };
}
