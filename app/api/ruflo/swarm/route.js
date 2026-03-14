import swarmQueen from '@/lib/ruflo/swarm-queen';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = swarmQueen.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'start': {
        const { pipelineId, taskIds, mode } = data;
        if (!taskIds?.length) return Response.json({ ok: false, error: 'taskIds required' }, { status: 400 });
        swarmQueen.start(pipelineId || `swarm-${Date.now()}`, taskIds, { mode });
        return Response.json({ ok: true, ...swarmQueen.getStatus() });
      }
      case 'stop':
        swarmQueen.stop();
        return Response.json({ ok: true });
      case 'pause':
        swarmQueen.pause();
        return Response.json({ ok: true });
      case 'resume':
        swarmQueen.resume();
        return Response.json({ ok: true });
      case 'report-completion': {
        const { taskId, status } = data;
        swarmQueen.reportCompletion(taskId, status);
        return Response.json({ ok: true, ...swarmQueen.getStatus() });
      }
      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
