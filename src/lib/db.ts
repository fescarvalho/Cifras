import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Helper to identify transient connection drops caused by Supabase idle timeouts
function isConnectionError(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || error).toLowerCase();
  return (
    msg.includes("connection terminated") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("57p01") ||
    msg.includes("closed") ||
    msg.includes("not queryable") ||
    msg.includes("terminating connection") ||
    msg.includes("socket") ||
    msg.includes("broken pipe") ||
    msg.includes("connection refused") ||
    msg.includes("can't reach database server")
  );
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

  // Supabase connection pooler (Supavisor/PgBouncer) drops idle connections quickly.
  // We configure short idleTimeout and active keep-alive so dead sockets are discarded
  // immediately rather than hanging future user queries.
  // Note: we do NOT override ssl with an object, allowing the driver to preserve SNI for the pooler.
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 3_000, // discard idle sockets quickly to prevent zombie connections
    connectionTimeoutMillis: 8_000, // fail fast (8s) instead of freezing the UI for 15s+
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
  });

  pool.on("error", (err) => {
    // Expected when Supabase closes idle pooler connections; ignore or log lightly
    console.warn("[pg pool] Conexão ociosa reciclada pelo pooler/Supabase:", err.message);
  });

  const adapter = new PrismaPg(pool);
  const baseClient = new PrismaClient({ adapter });

  // Add auto-retry extension for model queries: if a query encounters a dead connection after idle,
  // it waits briefly (allowing the pool to open a fresh socket) and transparently retries.
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          try {
            return await query(args);
          } catch (error: any) {
            if (isConnectionError(error)) {
              console.warn(`[prisma] Conexão inativa detectada em ${model}.${operation}. Reconectando automaticamente...`);
              await new Promise((resolve) => setTimeout(resolve, 300));
              return await query(args);
            }
            throw error;
          }
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Always preserve on globalThis to prevent multiple connection pools in serverless warm containers
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

/**
 * Lightweight health check helper to verify Supabase connectivity
 */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.song.findFirst({ select: { id: true } });
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error: any) {
    // Retry once after cold start / idle reconnection
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await prisma.song.findFirst({ select: { id: true } });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (retryError: any) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: retryError?.message || String(retryError),
      };
    }
  }
}


