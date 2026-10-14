import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await pingDatabase();

  if (result.ok) {
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        latencyMs: result.latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      status: "degraded",
      database: "disconnected",
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
      error: result.error,
    },
    { status: 503 }
  );
}
