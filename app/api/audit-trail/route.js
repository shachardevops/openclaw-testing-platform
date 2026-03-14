import auditTrail from '@/lib/audit-trail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const taskId = searchParams.get('taskId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (category || taskId) {
      const events = auditTrail.query({ category, taskId, limit });
      return Response.json({ ok: true, events });
    }

    const status = auditTrail.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'replay': {
        const { taskId } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        const events = auditTrail.replayTask(taskId);
        return Response.json({ ok: true, events });
      }

      case 'verify-chain': {
        const result = auditTrail.verifyChain();
        return Response.json({ ok: true, ...result });
      }

      case 'record': {
        const { category, eventAction, eventData, actor } = data;
        if (!category || !eventAction) {
          return Response.json({ ok: false, error: 'Missing category or eventAction' }, { status: 400 });
        }
        const event = auditTrail.record(category, eventAction, eventData || {}, actor || 'api');
        return Response.json({ ok: true, event });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
