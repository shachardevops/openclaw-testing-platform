import { NextRequest } from 'next/server';
import learningLoop from '@/lib/learning-loop';
import { reportsDir } from '@/lib/config';

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
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
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
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'learn-result': {
        const { taskId, result } = data;
        if (!taskId || !result) {
          return Response.json({ ok: false, error: 'Missing taskId or result' }, { status: 400 });
        }
        learningLoop.learnFromResult(taskId, result, reportsDir());
        return Response.json({ ok: true });
      }

      case 'learn-decision': {
        const { decision } = data;
        if (!decision) {
          return Response.json({ ok: false, error: 'Missing decision' }, { status: 400 });
        }
        learningLoop.learnFromOrchestratorDecision(decision);
        return Response.json({ ok: true });
      }

      case 'get-task-learnings': {
        const { taskId } = data;
        if (!taskId) {
          return Response.json({ ok: false, error: 'Missing taskId' }, { status: 400 });
        }
        const learnings = learningLoop.getTaskLearnings(taskId);
        return Response.json({ ok: true, learnings });
      }

      case 'get-patterns': {
        const patterns = learningLoop.getAllPatterns();
        return Response.json({ ok: true, patterns });
      }

      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
