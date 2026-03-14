import fs from 'fs';
import { bridgeLogPath } from '@/lib/config';
import { getControllerSessionId, spawnAgent } from '@/lib/openclaw';
import { getProjectConfig } from '@/lib/project-loader';
import { startRecording } from '@/lib/screencast-recorder';
import { isIdSafe } from '@/lib/security-validator';
import learningLoop from '@/lib/learning-loop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export async function POST(request) {
  try {
    const { agentId, profile, model, skills } = await request.json();
    if (!agentId) throw new Error('agentId required');
    if (!isIdSafe(agentId)) return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });

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
        .map(sid => SKILLS.find(s => s.id === sid))
        .filter(Boolean)
        .map(s => {
          const desc = s.description
            .replace(/\{workspace\}/g, workspace)
            .replace(/\{taskId\}/g, agentId);
          return `${s.name}: ${desc}`;
        })
        .join('\n');
      if (descs) skillText = `Add-on instructions:\n${descs}`;
    }

    // Enrich with learnings from previous runs (best-effort)
    let learningsText = '';
    try {
      const learnings = learningLoop.getTaskLearnings(agentId);
      if (learnings.length > 0) {
        const parts = [];
        for (const l of learnings) {
          if (l.type === 'known-bugs' && l.items?.length) {
            parts.push(`Known bugs: ${l.items.map(b => b.title).join(', ')}`);
          }
          if (l.type === 'recurring-failures' && l.items?.length) {
            parts.push(`Recurring failures: ${l.items[0].count} times`);
          }
          if (l.type === 'model-recommendation') {
            parts.push(`Recommended model: ${l.model} (${l.passRate}% pass rate)`);
          }
        }
        if (parts.length) learningsText = `\nPrior learnings:\n${parts.join('\n')}`;
      }
    } catch { /* learning loop unavailable */ }

    if (learningsText) {
      skillText = skillText ? `${skillText}\n${learningsText}` : learningsText;
    }

    // Use message template from config, or default
    const template = config.project.messageTemplates?.run;
    let msg;
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
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
