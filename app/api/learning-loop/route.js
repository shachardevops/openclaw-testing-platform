import learningLoop from '@/lib/learning-loop';
import { reportsDir } from '@/lib/config';
import { toErrorResponse, ValidationError } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/learning-loop
 * Returns learning loop status, pattern counts, model stats.
 */
export async function GET() {
  try {
    const status = learningLoop.getStatus();
    return Response.json({ ok: true, ...status });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * POST /api/learning-loop
 * Actions:
 *   - learn-result: learn from a completed task result
 *   - learn-decision: learn from an orchestrator decision
 *   - get-task-learnings: retrieve learnings relevant to a task
 *   - get-patterns: get all stored patterns
 */
export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'learn-result': {
        const { taskId, result } = data;
        if (!taskId || !result) throw new ValidationError('Missing taskId or result');
        learningLoop.learnFromResult(taskId, result, reportsDir());
        return Response.json({ ok: true });
      }

      case 'learn-decision': {
        const { decision } = data;
        if (!decision) throw new ValidationError('Missing decision');
        learningLoop.learnFromOrchestratorDecision(decision);
        return Response.json({ ok: true });
      }

      case 'get-task-learnings': {
        const { taskId } = data;
        if (!taskId) throw new ValidationError('Missing taskId');
        const learnings = learningLoop.getTaskLearnings(taskId);
        return Response.json({ ok: true, learnings });
      }

      case 'get-patterns': {
        const patterns = learningLoop.getAllPatterns();
        return Response.json({ ok: true, patterns });
      }

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
