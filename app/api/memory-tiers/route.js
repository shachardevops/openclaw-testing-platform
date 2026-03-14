import memoryManager from '@/lib/memory-tiers';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = memoryManager.getStatus();
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
      case 'store-working': {
        const { key, value } = data;
        if (!key) throw new ValidationError('Missing key');
        memoryManager.setWorking(key, value);
        return Response.json({ ok: true });
      }

      case 'get-working': {
        const { key } = data;
        if (!key) throw new ValidationError('Missing key');
        const value = memoryManager.getWorking(key);
        return Response.json({ ok: true, value });
      }

      case 'store-episodic': {
        const { key, value, importance } = data;
        if (!key) throw new ValidationError('Missing key');
        memoryManager.storeEpisodic(key, value, importance);
        return Response.json({ ok: true });
      }

      case 'search': {
        const { query, tier, limit } = data;
        if (!query) throw new ValidationError('Missing query');

        let results;
        if (tier === 'episodic') results = memoryManager.searchEpisodic(query, limit);
        else if (tier === 'semantic') results = memoryManager.searchSemantic(query, limit);
        else results = memoryManager.recall(query, limit);

        return Response.json({ ok: true, results });
      }

      case 'recall': {
        const { query, limit } = data;
        if (!query) throw new ValidationError('Missing query');
        const results = memoryManager.recall(query, limit);
        return Response.json({ ok: true, results });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
