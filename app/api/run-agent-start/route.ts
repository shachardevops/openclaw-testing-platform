import fs from 'fs';
import { NextRequest } from 'next/server';
import { bridgeLogPath } from '@/lib/config';
import { getControllerSessionId, spawnAgent } from '@/lib/openclaw';
import { getProjectConfig } from '@/lib/project-loader';
import { startRecording } from '@/lib/screencast-recorder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(request: NextRequest) {
  try {
    const { agentId, profile, model, skills } = await request.json() as {
      agentId: string;
      profile?: string;
      model?: string;
      skills?: string[];
    };
    if (!agentId) throw new Error('agentId required');

    const sessionId = getControllerSessionId();
    if (!sessionId) throw new Error('controllerSessionId missing in pipeline-config.json');

    const logPath = bridgeLogPath();
    const config = getProjectConfig();
    const SKILLS = config.skills;

    const workspace = config.project.workspace || '';

    // Build skill descriptions — resolve {workspace} and {taskId} placeholders
    let skillText = '';
    if (skills?.length) {
      const descs = skills
        .map(sid => SKILLS.find((s: any) => s.id === sid))
        .filter(Boolean)
        .map((s: any) => {
          const desc = s.description
            .replace(/\{workspace\}/g, workspace)
            .replace(/\{taskId\}/g, agentId);
          return `${s.name}: ${desc}`;
        })
        .join('\n');
      if (descs) skillText = `Add-on instructions:\n${descs}`;

    }

    // Use message template from config, or default
    const template = config.project.messageTemplates?.run;
    let msg: string;
    if (template) {
      msg = renderTemplate(template, {
        taskId: agentId,
        profile: profile || 'openclaw',
        model: model || 'default',
        skills: skillText,
        workspace: config.project.workspace || '',
      });
    } else {
      // Legacy fallback
      const lines = [
        '[dashboard-run]',
        `Start agent run for task: ${agentId}`,
        `Browser profile: ${profile || 'openclaw'}`,
        `Model: ${model || 'default'}`,
      ];
      if (skillText) lines.push(skillText);
      lines.push('Use sessions_spawn now with the specified model, then update results/<agent>.json to running immediately.');
      msg = lines.join('\n');
    }

    const logEntry = `\n[${new Date().toISOString()}] run-agent-start ${agentId} profile=${profile || 'openclaw'} model=${model || 'default'}${skills?.length ? ` skills=${skills.join(',')}` : ''}\n`;
    fs.appendFileSync(logPath, logEntry);

    const child = spawnAgent(sessionId, msg, logPath);

    // Auto-start recording (non-blocking — browser may not be ready yet)
    startRecording(agentId).catch(() => {});

    return Response.json({ ok: true, queued: true, sessionId, pid: child.pid });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
