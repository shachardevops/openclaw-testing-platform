import { getBoosterStats } from '@/lib/ruflo/agent-booster';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = getBoosterStats();
    return Response.json({ ok: true, ...stats });
  } catch (e) {
    return toErrorResponse(e);
  }
}
