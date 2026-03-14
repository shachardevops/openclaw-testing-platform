import { NextRequest } from 'next/server';
import taskClaims from '@/lib/task-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = taskClaims.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as { action: string; taskId?: string; owner?: string; ttlMs?: number; force?: boolean; fromOwner?: string; toOwner?: string };
    const { action } = data;

    switch (action) {
      case 'claim': {
        const { taskId, owner, ttlMs, force } = data;
        if (!taskId || !owner) {
          return Response.json({ ok: false, error: 'Missing taskId or owner' }, { status: 400 });
        }
        const result = taskClaims.claim(taskId, owner, { ttlMs, force });
        return Response.json(result);
      }

      case 'release': {
        const { taskId, owner } = data;
        if (!taskId || !owner) {
          return Response.json({ ok: false, error: 'Missing taskId or owner' }, { status: 400 });
        }
        const result = taskClaims.release(taskId, owner);
        return Response.json(result);
      }

      case 'handoff': {
        const { taskId, fromOwner, toOwner } = data;
        if (!taskId || !fromOwner || !toOwner) {
          return Response.json({ ok: false, error: 'Missing taskId, fromOwner, or toOwner' }, { status: 400 });
        }
        const result = taskClaims.handoff(taskId, fromOwner, toOwner);
        return Response.json(result);
      }

      case 'check': {
        const { taskId } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        const owner = taskClaims.isClaimedBy(taskId);
        const claim = taskClaims.getClaim(taskId);
        return Response.json({ ok: true, claimed: !!owner, owner, claim });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
