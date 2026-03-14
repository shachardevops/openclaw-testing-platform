import rlRouter from '@/lib/ruflo/rl-router';
import sona from '@/lib/ruflo/sona';
import { selectModel } from '@/lib/ruflo/task-router';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const mode = searchParams.get('mode');

    if (mode) sona.setMode(mode);

    if (taskId) {
      const result = selectModel(taskId);
      return Response.json({ ok: true, taskId, ...result });
    }

    return Response.json({
      ok: true,
      rl: rlRouter.getStats(),
      sona: sona.getState(),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { action } = data;

    switch (action) {
      case 'observe': {
        const { taskId, modelId, outcome } = data;
        if (!taskId || !modelId) return Response.json({ ok: false, error: 'taskId and modelId required' }, { status: 400 });
        const result = sona.observe(taskId, modelId, outcome || {});
        return Response.json({ ok: true, ...result });
      }
      case 'set-mode': {
        sona.setMode(data.mode || 'balanced');
        return Response.json({ ok: true, mode: data.mode });
      }
      case 'override': {
        const { taskId, recommendedModel, chosenModel } = data;
        sona.recordOverride(taskId, recommendedModel, chosenModel);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
