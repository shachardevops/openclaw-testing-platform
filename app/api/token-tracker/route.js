import tokenTracker from '@/lib/token-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = tokenTracker.getStatus();
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
      case 'record': {
        const { taskId, result } = data;
        if (!taskId || !result) {
          return Response.json({ ok: false, error: 'Missing taskId or result' }, { status: 400 });
        }
        tokenTracker.recordTaskCompletion(taskId, result);
        return Response.json({ ok: true });
      }

      case 'suggest-model': {
        const { complexity } = data;
        const suggestion = tokenTracker.suggestModel(complexity || 'medium');
        return Response.json({ ok: true, ...suggestion });
      }

      case 'efficiency': {
        const mostEfficient = tokenTracker.getMostEfficientModel();
        return Response.json({ ok: true, mostEfficient });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
