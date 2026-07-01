import { NextResponse } from "next/server";
import { getSetlists } from "@/app/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const setlists = await getSetlists();
    return NextResponse.json(setlists);
  } catch (error: any) {
    console.error("Failed to fetch setlists in API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
