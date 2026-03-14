import selfHealing from '@/lib/self-healing';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = selfHealing.getStatus();
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
      case 'should-retry': {
        const { taskId, failureContext } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        const result = selfHealing.shouldRetryTask(taskId, failureContext || {});
        return Response.json({ ok: true, ...result });
      }

      case 'reset-task': {
        const { taskId } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        selfHealing.resetTask(taskId);
        return Response.json({ ok: true });
      }

      case 'circuit-status': {
        const { name } = data;
        if (!name) throw new ValidationError('Missing circuit breaker name');
        const cb = selfHealing.getCircuitBreaker(name);
        return Response.json({ ok: true, ...cb.getStatus() });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
