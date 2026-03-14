import { NextRequest } from 'next/server';
import { getControllerSessionId, execAgent } from '@/lib/openclaw';
import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(request: NextRequest) {
  try {
    const { agentId } = await request.json() as { agentId: string };
    if (!agentId) throw new Error('agentId is required');
    if (!SAFE_ID.test(agentId)) throw new Error('Invalid agentId format');

    const sessionId = getControllerSessionId();
    if (!sessionId) throw new Error('controllerSessionId missing in pipeline-config.json');

    const config = getProjectConfig();
    const template = config.project.messageTemplates?.cancel;

    let msg: string;
    if (template) {
      msg = renderTemplate(template, {
        taskId: agentId,
        workspace: config.project.workspace || '',
      });
    } else {
      msg = [
        '[dashboard-cancel]',
        `Cancel agent run for task: ${agentId}`,
        'If a spawned run/session is active for this agent, stop/kill it now.',
        `Then update results/${agentId}.json with status "failed" and a finding that it was cancelled by user.`,
      ].join('\n');
    }

    const output = await execAgent(sessionId, msg);
    return Response.json({ ok: true, cancelled: true, sessionId, output: (output || '').slice(0, 600) });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
