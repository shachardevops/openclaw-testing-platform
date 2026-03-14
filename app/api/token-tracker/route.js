import tokenTracker from '@/lib/token-tracker';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = tokenTracker.getStatus();
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
      case 'record': {
        const { taskId, result } = data;
        if (!taskId || !result) throw new ValidationError('Missing taskId or result');
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
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
