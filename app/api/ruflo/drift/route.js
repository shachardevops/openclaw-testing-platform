import antiDrift from '@/lib/ruflo/anti-drift';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (taskId) {
      const result = antiDrift.check(taskId);
      return Response.json({ ok: true, taskId, ...result });
    }

    return Response.json({ ok: true, alerts: antiDrift.getAlerts() });
  } catch (e) {
    return toErrorResponse(e);
  }
}
