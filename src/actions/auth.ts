"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const ALLOWED_EMAIL_DOMAIN = "@srmist.edu.in";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAllowedCollegeEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_EMAIL_DOMAIN);
}

export async function registerAction(name: string, email: string, passwordRaw: string) {
  if (!name || !email || !passwordRaw) {
    throw new Error("Missing fields");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isAllowedCollegeEmail(normalizedEmail)) {
    throw new Error("Only @srmist.edu.in email addresses can register.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  const password = await bcrypt.hash(passwordRaw, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      password,
      role: "TEACHER", // Automatically give them teacher role to host quizzes
    },
  });

  return { success: true, user: { id: user.id, email: user.email, name: user.name } };
}
