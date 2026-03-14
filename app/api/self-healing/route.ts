import { NextRequest } from 'next/server';
import selfHealing from '@/lib/self-healing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = selfHealing.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as { action: string; taskId?: string; failureContext?: Record<string, unknown>; name?: string };
    const { action } = data;

    switch (action) {
      case 'should-retry': {
        const { taskId, failureContext } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        const result = selfHealing.shouldRetryTask(taskId, failureContext || {});
        return Response.json({ ok: true, ...result });
      }

      case 'reset-task': {
        const { taskId } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        selfHealing.resetTask(taskId);
        return Response.json({ ok: true });
      }

      case 'circuit-status': {
        const { name } = data;
        if (!name) {
          return Response.json({ ok: false, error: 'Missing circuit breaker name' }, { status: 400 });
        }
        const cb = selfHealing.getCircuitBreaker(name);
        return Response.json({ ok: true, ...cb.getStatus() });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
