import { NextRequest } from 'next/server';
import { getSwarmState, getAgentDetail } from '@/lib/swarm-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/swarm — Full swarm state (agents, topology, timeline, stats)
 * GET /api/swarm?agentId=xxx — Detailed single agent view
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (agentId) {
      const detail = getAgentDetail(agentId);
      if (!detail) {
        return Response.json({ ok: false, error: 'Agent not found' }, { status: 404 });
      }
      return Response.json({ ok: true, agent: detail });
    }

    const state = getSwarmState();
    return Response.json({ ok: true, ...state });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
