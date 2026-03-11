import { listSessions } from '@/lib/openclaw';
import { sendChat } from '@/lib/openclaw-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { sessionId } = await params;
    const sessions = await listSessions();
    const session = sessions.find(s => (s.sessionId || s.id) === sessionId);

    if (!session) {
      return Response.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }

    return Response.json({ ok: true, session });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { sessionId } = await params;
    const { message } = await request.json();
    if (!message) return Response.json({ error: 'message required' }, { status: 400 });

    const result = await sendChat(null, message, { sessionKey: sessionId });
    return Response.json({ ok: true, result });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
