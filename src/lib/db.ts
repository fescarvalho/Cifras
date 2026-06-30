import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  return new PrismaClient({} as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

