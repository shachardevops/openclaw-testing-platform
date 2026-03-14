import { NextRequest } from 'next/server';
import driftDetector from '@/lib/drift-detector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = driftDetector.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'checkpoint': {
        const { taskId, result } = data;
        if (!taskId || !result) {
          return Response.json({ ok: false, error: 'Missing taskId or result' }, { status: 400 });
        }
        driftDetector.recordCheckpoint(taskId, result);
        return Response.json({ ok: true });
      }

      case 'check-loops': {
        const { taskId, recentOutput } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        const loopResult = driftDetector.checkForLoops(taskId, recentOutput || []);
        return Response.json({ ok: true, result: loopResult });
      }

      case 'evaluate': {
        const { taskIds } = data;
        if (!Array.isArray(taskIds)) {
          return Response.json({ ok: false, error: 'Missing taskIds array' }, { status: 400 });
        }
        const alerts = driftDetector.evaluateAll(taskIds);
        return Response.json({ ok: true, alerts });
      }

      case 'clear': {
        const { taskId } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        driftDetector.clearTask(taskId);
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
