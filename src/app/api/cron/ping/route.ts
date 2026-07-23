import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verifying the cron job authentication if Vercel Cron is configured with a secret
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Perform a very lightweight query just to wake up Supabase.
    // By asking Prisma to execute a simple 'SELECT 1', it opens a connection and pings the DB.
    await prisma.$queryRaw`SELECT 1;`;
    
    return NextResponse.json({ success: true, message: 'Ping successful' }, { status: 200 });
  } catch (error) {
    console.error('Ping error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
