import vectorMemory from '@/lib/vector-memory';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/vector-search
 * Returns vector memory status (collection stats, config).
 */
export async function GET() {
  try {
    const status = vectorMemory.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * POST /api/vector-search
 * Actions:
 *   - search: semantic search across a collection or all collections
 *   - hybrid-search: combined semantic + keyword search
 *   - insert: store a vector entry
 *   - find-decisions: find similar past orchestrator decisions
 *   - find-learnings: find relevant learnings for a task
 */
export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'search': {
        const { query, collection, limit } = data;
        if (!query) throw new ValidationError('Missing query');
        let results;
        if (collection) {
          results = await vectorMemory.collection(collection).search(query, limit || 10);
        } else {
          results = await vectorMemory.searchAll(query, limit || 10);
        }
        return Response.json({ ok: true, results });
      }

      case 'hybrid-search': {
        const { query, collection, limit } = data;
        if (!query) throw new ValidationError('Missing query');
        const coll = collection || 'learnings';
        const results = await vectorMemory.collection(coll).hybridSearch(query, limit || 10);
        return Response.json({ ok: true, results });
      }

      case 'insert': {
        const { id, text, collection, metadata } = data;
        if (!id || !text) throw new ValidationError('Missing id or text');
        const coll = collection || 'learnings';
        const result = await vectorMemory.collection(coll).insert(id, text, metadata || {});
        return Response.json({ ok: true, ...result });
      }

      case 'find-decisions': {
        const { query, limit } = data;
        if (!query) throw new ValidationError('Missing query');
        const results = await vectorMemory.findSimilarDecisions(query, limit || 5);
        return Response.json({ ok: true, results });
      }

      case 'find-learnings': {
        const { query, limit } = data;
        if (!query) throw new ValidationError('Missing query');
        const results = await vectorMemory.findRelevantLearnings(query, limit || 10);
        return Response.json({ ok: true, results });
      }

      case 'store-learning': {
        const { id, text, metadata } = data;
        if (!id || !text) throw new ValidationError('Missing id or text');
        const result = await vectorMemory.storeLearning(id, text, metadata || {});
        return Response.json({ ok: true, ...result });
      }

      case 'store-decision': {
        const { id, text, metadata } = data;
        if (!id || !text) throw new ValidationError('Missing id or text');
        const result = await vectorMemory.storeDecision(id, text, metadata || {});
        return Response.json({ ok: true, ...result });
      }

      case 'store-pattern': {
        const { id, text, metadata } = data;
        if (!id || !text) throw new ValidationError('Missing id or text');
        const result = await vectorMemory.storePattern(id, text, metadata || {});
        return Response.json({ ok: true, ...result });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
