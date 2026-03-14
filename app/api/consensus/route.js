import consensusValidator from '@/lib/consensus-validator';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = consensusValidator.getStatus();
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
      case 'evaluate': {
        const { actionType, context } = data;
        if (!actionType) throw new ValidationError('Missing actionType');
        const result = consensusValidator.evaluate(actionType, context || {});
        return Response.json({ ok: true, ...result });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
