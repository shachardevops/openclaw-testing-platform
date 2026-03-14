import { NextRequest } from 'next/server';
import { streamChat, sendChat, checkGatewayHealth } from '@/lib/openclaw-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { agentId, message, stream = true, user, sessionKey } = await request.json() as {
      agentId?: string;
      message?: string;
      stream?: boolean;
      user?: string;
      sessionKey?: string;
    };
    if (!message) return Response.json({ error: 'message required' }, { status: 400 });

    // Check health first
    const health = await checkGatewayHealth();
    if (!health.available || !health.endpointsEnabled) {
      return Response.json({
        error: 'Gateway not available',
        reason: health.reason,
        instructions: health.instructions,
      }, { status: 503 });
    }

    if (!stream) {
      const result = await sendChat(agentId, message, { user, sessionKey });
      return Response.json({ ok: true, result });
    }

    // Streaming mode — proxy SSE
    const upstream = await streamChat(agentId, message, { user });

    return new Response(upstream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
