import { evaluateGates, recordGateResult, getGateStatus, loadQualityGatesConfig } from '@/lib/quality-gates';
import { reportsDir } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/quality-gates
 * Returns quality gate status, config, and recent results.
 */
export async function GET() {
  try {
    const status = getGateStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/quality-gates
 * Actions: evaluate (check gates for a task result)
 */
export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    if (action === 'evaluate') {
      const { taskId, result } = data;
      if (!taskId || !result) {
        return Response.json({ ok: false, error: 'Missing taskId or result' }, { status: 400 });
      }

      const config = loadQualityGatesConfig();
      const evaluation = evaluateGates(taskId, result, reportsDir());

      let actionTaken = 'passed';
      if (!evaluation.passed) {
        actionTaken = config.failAction === 'block' ? 'blocked' : 'warned';
      }

      recordGateResult(taskId, evaluation, actionTaken);

      return Response.json({
        ok: true,
        passed: evaluation.passed,
        violations: evaluation.violations,
        action: actionTaken,
      });
    }

    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
