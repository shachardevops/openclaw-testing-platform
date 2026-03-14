import consensusEngine from '@/lib/ruflo/consensus';
import '@/lib/ruflo/consensus-sources';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      const status = await consensusEngine.getStatus(sessionId);
      return Response.json({ ok: true, sessionId, ...status });
    }

    const states = consensusEngine.getAllStates();
    return Response.json({ ok: true, sessions: states });
  } catch (e) {
    return toErrorResponse(e);
  }
}
