import { NextRequest } from 'next/server';
import { getSecurityStatus, getSecurityEvents } from '@/lib/security-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventsOnly = searchParams.get('events') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (eventsOnly) {
      const events = getSecurityEvents(limit);
      return Response.json({ ok: true, events });
    }

    const status = getSecurityStatus();
    return Response.json({ ok: true, ...status });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
