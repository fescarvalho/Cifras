import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const songs = await prisma.song.findMany({
      orderBy: { title: "asc" },
    });
    return NextResponse.json(songs);
  } catch (error) {
    console.error("Failed to fetch songs API:", error);
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 });
  }
}
