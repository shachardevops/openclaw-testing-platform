import { getSecurityStatus, getSecurityEvents } from '@/lib/security-validator';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
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
  } catch (e) {
    return toErrorResponse(e);
  }
}
