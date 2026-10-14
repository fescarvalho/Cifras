import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await pingDatabase();

  return NextResponse.json(
    {
      status: result.ok ? "ok" : "warming_up",
      database: result.ok ? "connected" : "reconnecting",
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
      ...(result.error ? { details: result.error } : {}),
    },
    { status: 200 }
  );
}

