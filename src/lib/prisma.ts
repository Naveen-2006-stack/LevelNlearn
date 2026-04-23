import { PrismaClient } from "@prisma/client";

// Singleton: prevents multiple instances during Next.js dev hot-reloads.
// Lazy initialization ensures DATABASE_URL is available at call time, not module load time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

// Also export a direct reference for convenience in server actions
// (called at request time, not module load time, so DATABASE_URL is available).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as any)[prop];
  },
});
