import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  // Use DIRECT_URL (sem PgBouncer) para evitar conflito de protocolo entre
  // o pooler do Supabase e o connection pool interno do `pg`.
  // DATABASE_URL com pgbouncer=true é só para migrações via Prisma CLI.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  const pool = new Pool({
    connectionString,
    max: 5,                  // Máximo de conexões simultâneas
    idleTimeoutMillis: 30000, // Fecha conexões ociosas após 30s
    connectionTimeoutMillis: 10000, // Timeout de 10s ao conectar
  });

  // Loga erros do pool em vez de deixar silenciosos (causa crashes)
  pool.on("error", (err) => {
    console.error("[pg pool] Unexpected error:", err.message);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

