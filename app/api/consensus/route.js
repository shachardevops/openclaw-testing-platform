import consensusValidator from '@/lib/consensus-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = consensusValidator.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'evaluate': {
        const { actionType, context } = data;
        if (!actionType) {
          return Response.json({ ok: false, error: 'Missing actionType' }, { status: 400 });
        }
        const result = consensusValidator.evaluate(actionType, context || {});
        return Response.json({ ok: true, ...result });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
