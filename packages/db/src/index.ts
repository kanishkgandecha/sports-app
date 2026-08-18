import { PrismaClient } from "@prisma/client";

// Standard Next.js/serverless-safe singleton: reuse the client across hot
// reloads / module re-evaluations instead of opening a new pool each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
