import orchestratorEngine from '@/lib/orchestrator-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/orchestrator
 * Returns orchestrator engine status: stats, decisions, conditions, pending review.
 */
export async function GET() {
  try {
    const status = orchestratorEngine.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/orchestrator
 * Actions: pause, resume, nudge, swap, kill, recover,
 *          approve-recommendation, reject-recommendation
 */
export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;
    let result;

    switch (action) {
      case 'pause':
        orchestratorEngine.pause();
        result = { ok: true, paused: true };
        break;

      case 'resume':
        orchestratorEngine.resume();
        result = { ok: true, paused: false };
        break;

      case 'nudge':
        if (!data.sessionId) {
          result = { ok: false, error: 'Missing sessionId' };
        } else {
          result = orchestratorEngine.manualNudge(data.sessionId);
        }
        break;

      case 'swap':
        if (!data.sessionId || !data.targetModel) {
          result = { ok: false, error: 'Missing sessionId or targetModel' };
        } else {
          result = orchestratorEngine.manualSwap(data.sessionId, data.targetModel);
        }
        break;

      case 'kill':
        if (!data.sessionId) {
          result = { ok: false, error: 'Missing sessionId' };
        } else {
          result = orchestratorEngine.manualKill(data.sessionId);
        }
        break;

      case 'recover':
        if (!data.taskId) {
          result = { ok: false, error: 'Missing taskId' };
        } else {
          result = orchestratorEngine.manualRecover(data.taskId);
        }
        break;

      case 'approve-recommendation':
        if (!data.id) {
          result = { ok: false, error: 'Missing recommendation id' };
        } else {
          result = orchestratorEngine.approveRecommendation(data.id);
        }
        break;

      case 'reject-recommendation':
        if (!data.id) {
          result = { ok: false, error: 'Missing recommendation id' };
        } else {
          result = orchestratorEngine.rejectRecommendation(data.id);
        }
        break;

      default:
        result = { ok: false, error: `Unknown action: ${action}` };
    }

    return Response.json(result, { status: result?.ok === false ? 400 : 200 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
