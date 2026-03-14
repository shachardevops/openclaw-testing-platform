import reasoningBank from '@/lib/ruflo/reasoning-bank';
import knowledgeGraph from '@/lib/ruflo/knowledge-graph';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'stats';
    const storyId = searchParams.get('storyId');
    const model = searchParams.get('model');

    switch (type) {
      case 'stats':
        return Response.json({
          ok: true,
          bank: reasoningBank.stats(),
          graph: knowledgeGraph.getStats(),
        });

      case 'query':
        return Response.json({
          ok: true,
          entries: reasoningBank.query({ storyId, model, limit: 20 }),
        });

      case 'distill':
        return Response.json({
          ok: true,
          context: reasoningBank.distill(storyId, model),
        });

      case 'graph':
        return Response.json({
          ok: true,
          graph: knowledgeGraph.toJSON(),
        });

      case 'pagerank':
        return Response.json({
          ok: true,
          ranks: knowledgeGraph.pageRank(),
        });

      case 'communities':
        return Response.json({
          ok: true,
          communities: knowledgeGraph.findCommunities(),
        });

      default:
        return Response.json({ ok: false, error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'append': {
        const entry = reasoningBank.append(data.entry || {});
        return Response.json({ ok: true, entry });
      }
      case 'add-node': {
        knowledgeGraph.addNode(data.id, data.nodeType, data.data);
        return Response.json({ ok: true });
      }
      case 'add-edge': {
        knowledgeGraph.addEdge(data.from, data.relation, data.to, data.weight);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
