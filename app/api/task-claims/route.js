import taskClaims from '@/lib/task-claims';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = taskClaims.getStatus();
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
      case 'claim': {
        const { taskId, owner, ttlMs, force } = data;
        if (!taskId || !owner) throw new ValidationError('Missing taskId or owner');
        const result = taskClaims.claim(taskId, owner, { ttlMs, force });
        return Response.json(result);
      }

      case 'release': {
        const { taskId, owner } = data;
        if (!taskId || !owner) throw new ValidationError('Missing taskId or owner');
        const result = taskClaims.release(taskId, owner);
        return Response.json(result);
      }

      case 'handoff': {
        const { taskId, fromOwner, toOwner } = data;
        if (!taskId || !fromOwner || !toOwner) throw new ValidationError('Missing taskId, fromOwner, or toOwner');
        const result = taskClaims.handoff(taskId, fromOwner, toOwner);
        return Response.json(result);
      }

      case 'check': {
        const { taskId } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        const owner = taskClaims.isClaimedBy(taskId);
        const claim = taskClaims.getClaim(taskId);
        return Response.json({ ok: true, claimed: !!owner, owner, claim });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
