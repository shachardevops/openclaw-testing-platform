import { NextRequest } from 'next/server';
import { listSessions } from '@/lib/openclaw';
import { sendChat } from '@/lib/openclaw-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const sessions = await listSessions();
    const session = sessions.find((s: any) => (s.sessionId || s.id) === sessionId);

    if (!session) {
      return Response.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }

    return Response.json({ ok: true, session });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const { message } = await request.json() as { message: string };
    if (!message) return Response.json({ error: 'message required' }, { status: 400 });

    const result = await sendChat(null, message, { sessionKey: sessionId });
    return Response.json({ ok: true, result });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
