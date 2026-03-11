import { listSessions } from '@/lib/openclaw';
import { readPipelineConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await listSessions();
    const cfg = readPipelineConfig();
    const controllerSessionId = cfg.controllerSessionId || null;

    // Enrich sessions with age and controller flag
    const now = Date.now();
    const enriched = sessions.map(s => {
      const createdMs = s.createdAt ? Date.parse(s.createdAt) : 0;
      const ageMinutes = createdMs ? Math.round((now - createdMs) / 60000) : null;
      return {
        ...s,
        ageMinutes,
        isController: s.sessionId === controllerSessionId || s.id === controllerSessionId,
      };
    });

    return Response.json({ ok: true, sessions: enriched, count: enriched.length });
  } catch (e) {
    return Response.json({ ok: false, error: e.message, sessions: [] }, { status: 500 });
  }
}
