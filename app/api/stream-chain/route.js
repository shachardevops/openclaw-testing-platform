/**
 * SSE endpoint for consuming stream chain events.
 */

import { getChainBus } from '@/lib/ruflo/chain-bus';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = searchParams.get('chainId');
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!chainId) {
      return Response.json({ ok: false, error: 'chainId required' }, { status: 400 });
    }

    const bus = getChainBus(chainId);
    const events = bus.slice(offset);

    // SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sync', offset: bus.length })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
