import { NextRequest } from 'next/server';
import { getControllerSessionId, listSessions } from '@/lib/openclaw';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const maxAgeMin = Math.max(5, Number(searchParams.get('maxAgeMin') || 30));
    const now = Date.now();
    const maxAgeMs = maxAgeMin * 60 * 1000;
    const controllerSessionId = getControllerSessionId();
    const sessions = await listSessions();

    const orphaned = sessions
      .filter((s: any) => s && typeof s === 'object')
      .filter((s: any) => s.key !== 'agent:main:main')
      .filter((s: any) => !controllerSessionId || s.sessionId !== controllerSessionId)
      .map((s: any) => {
        const updatedAt = Number(s.updatedAt || 0);
        const ageMs = updatedAt > 0 ? Math.max(0, now - updatedAt) : Number.MAX_SAFE_INTEGER;
        return {
          key: s.key || '',
          sessionId: s.sessionId || '',
          kind: s.kind || '',
          model: s.model || '',
          updatedAt,
          ageMs,
          ageMin: Math.floor(ageMs / 60000),
          lastChannel: s.lastChannel || '',
        };
      })
      .filter((s: { ageMs: number }) => s.ageMs >= maxAgeMs)
      .sort((a: { ageMs: number }, b: { ageMs: number }) => b.ageMs - a.ageMs);

    return Response.json({ ok: true, maxAgeMin, count: orphaned.length, orphaned });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
