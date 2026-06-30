import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  // Prefer DATABASE_URL (PgBouncer) for Vercel serverless compatibility.
  // Use a single pg.Pool (not layered on top of PgBouncer's own pooling).
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  const pool = new pg.Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  pool.on("error", (err) => {
    console.error("[pg pool] Unexpected error:", err.message);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
