import decisionAudit from '@/lib/ruflo/decision-audit';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const conditionType = searchParams.get('conditionType');
    const target = searchParams.get('target');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const since = searchParams.get('since');

    const entries = decisionAudit.query({ source, conditionType, target, limit, since });
    const stats = decisionAudit.getStats();

    return Response.json({ ok: true, entries, stats });
  } catch (e) {
    return toErrorResponse(e);
  }
}
