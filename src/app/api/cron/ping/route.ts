import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secretParam = url.searchParams.get('secret');
  const authHeader = request.headers.get('authorization');

  // Verify cron secret if configured: accepts either Bearer header or ?secret= query param
  if (process.env.CRON_SECRET) {
    const isHeaderValid = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const isParamValid = secretParam === process.env.CRON_SECRET;

    if (!isHeaderValid && !isParamValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await pingDatabase();

  if (result.ok) {
    return NextResponse.json({
      success: true,
      message: 'Ping successful. Supabase is active.',
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  } else {
    console.error('Supabase ping error:', result.error);
    return NextResponse.json({
      success: false,
      error: 'Supabase ping failed',
      details: result.error,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

