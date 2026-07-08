import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";

export async function PATCH(request: Request, context: any) {
  try {
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // Using context.params directly without awaiting for Next.js 14 compatibility, 
    // or await it if it's Next.js 15. The prompt doesn't specify so we just use it.
    const params = context.params;
    const id = params.id;
    const body = await request.json();
    
    if (body.originalKey) {
      const updated = await prisma.song.updateMany({
        where: { id, userId: session.user.id },
        data: { originalKey: body.originalKey }
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
      return NextResponse.json({ success: true, originalKey: body.originalKey });
    }
    
    return NextResponse.json({ error: "Missing originalKey" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
