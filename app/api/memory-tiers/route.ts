import { NextRequest } from 'next/server';
import memoryManager from '@/lib/memory-tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = memoryManager.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as { action: string; key?: string; value?: unknown; importance?: number; query?: string; tier?: string; limit?: number };
    const { action } = data;

    switch (action) {
      case 'store-working': {
        const { key, value } = data;
        if (!key) return Response.json({ ok: false, error: 'Missing key' }, { status: 400 });
        memoryManager.setWorking(key, value);
        return Response.json({ ok: true });
      }

      case 'get-working': {
        const { key } = data;
        if (!key) return Response.json({ ok: false, error: 'Missing key' }, { status: 400 });
        const value = memoryManager.getWorking(key);
        return Response.json({ ok: true, value });
      }

      case 'store-episodic': {
        const { key, value, importance } = data;
        if (!key) return Response.json({ ok: false, error: 'Missing key' }, { status: 400 });
        memoryManager.storeEpisodic(key, value, importance);
        return Response.json({ ok: true });
      }

      case 'search': {
        const { query, tier, limit } = data;
        if (!query) return Response.json({ ok: false, error: 'Missing query' }, { status: 400 });

        let results;
        if (tier === 'episodic') results = memoryManager.searchEpisodic(query, limit);
        else if (tier === 'semantic') results = memoryManager.searchSemantic(query, limit);
        else results = memoryManager.recall(query, limit);

        return Response.json({ ok: true, results });
      }

      case 'recall': {
        const { query, limit } = data;
        if (!query) return Response.json({ ok: false, error: 'Missing query' }, { status: 400 });
        const results = memoryManager.recall(query, limit);
        return Response.json({ ok: true, results });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
