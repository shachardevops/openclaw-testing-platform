import sessionManager from '@/lib/session-manager';
import orchestratorEngine from '@/lib/orchestrator-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-start the scan loop + orchestrator engine on first request
let _booted = false;
function ensureStarted() {
  if (!_booted) {
    _booted = true;
    sessionManager.start();
    orchestratorEngine.start();
  }
}

/**
 * GET /api/session-manager
 * Returns full state snapshot.
 */
export async function GET() {
  ensureStarted();
  try {
    const state = sessionManager.getState();
    return Response.json({ ok: true, ...state });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/session-manager
 * Execute an action: scan, nudge, swap, kill, kill-orphans, dedup, dedup-all,
 * pause-escalation, resume-escalation.
 */
export async function POST(request) {
  ensureStarted();
  try {
    const data = await request.json();
    const action = data.action;
    let result;

    switch (action) {
      case 'scan':
        await sessionManager.scan();
        result = { ok: true, action: 'scan' };
        break;
      case 'nudge':
        result = sessionManager.nudge(data.sessionId);
        break;
      case 'swap':
        result = sessionManager.swapModel(data.sessionId, data.targetModel);
        break;
      case 'kill':
        result = sessionManager.killSession(data.sessionId);
        break;
      case 'kill-orphans':
        result = sessionManager.killOrphans();
        break;
      case 'dedup':
        result = sessionManager.dedup(data.taskId);
        break;
      case 'dedup-all':
        result = sessionManager.dedupAll();
        break;
      case 'pause-escalation':
        sessionManager.escalationPaused = true;
        result = { ok: true, escalationPaused: true };
        break;
      case 'resume-escalation':
        sessionManager.escalationPaused = false;
        result = { ok: true, escalationPaused: false };
        break;
      default:
        result = { ok: false, error: `Unknown action: ${action}` };
    }

    return Response.json(result, { status: result?.ok === false ? 400 : 200 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
