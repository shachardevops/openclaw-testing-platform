import driftDetector from '@/lib/drift-detector';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = driftDetector.getStatus();
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
      case 'checkpoint': {
        const { taskId, result } = data;
        if (!taskId || !result) throw new ValidationError('Missing taskId or result');
        driftDetector.recordCheckpoint(taskId, result);
        return Response.json({ ok: true });
      }

      case 'check-loops': {
        const { taskId, recentOutput } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        const loopResult = driftDetector.checkForLoops(taskId, recentOutput || []);
        return Response.json({ ok: true, result: loopResult });
      }

      case 'evaluate': {
        const { taskIds } = data;
        if (!Array.isArray(taskIds)) throw new ValidationError('Missing taskIds array');
        const alerts = driftDetector.evaluateAll(taskIds);
        return Response.json({ ok: true, alerts });
      }

      case 'clear': {
        const { taskId } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        driftDetector.clearTask(taskId);
        return Response.json({ ok: true });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
