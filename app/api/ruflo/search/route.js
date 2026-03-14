import { searchAll, findSimilarBugs, findRelevantNotes, findRelatedRuns, findSimilarDecisions } from '@/lib/ruflo/semantic-search';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { query, collection, limit = 5 } = await request.json();
    if (!query) return Response.json({ ok: false, error: 'query required' }, { status: 400 });

    let results;
    if (collection) {
      switch (collection) {
        case 'bugs': results = await findSimilarBugs(query, limit); break;
        case 'module-notes': results = await findRelevantNotes(query, limit); break;
        case 'run-history': results = await findRelatedRuns(query, null, limit); break;
        case 'decisions': results = await findSimilarDecisions(query, limit); break;
        default: results = [];
      }
      return Response.json({ ok: true, collection, results });
    }

    results = await searchAll(query, limit);
    return Response.json({ ok: true, results });
  } catch (e) {
    return toErrorResponse(e);
  }
}
