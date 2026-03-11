import fs from 'fs';
import { bridgeLogPath } from '@/lib/config';
import { getControllerSessionId, spawnAgent } from '@/lib/openclaw';
import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat-send
 * Body: { taskId, message }
 *
 * Sends a user chat message to the OpenClaw controller session.
 * Works without gateway — uses CLI spawnAgent directly.
 * The controller will relay the message to the appropriate task session.
 */
export async function POST(request) {
  try {
    const { taskId, message } = await request.json();
    if (!message?.trim()) throw new Error('message required');

    const controllerSessionId = getControllerSessionId();
    if (!controllerSessionId) {
      throw new Error('Controller session not configured. Set controllerSessionId in pipeline-config.json.');
    }

    const config = getProjectConfig();
    const template = config.project.messageTemplates?.chat;

    const msg = template
      ? template
          .replace(/\{taskId\}/g, taskId || 'controller')
          .replace(/\{message\}/g, message.trim())
          .replace(/\{workspace\}/g, config.project.workspace || '')
      : `[dashboard-chat] ${taskId ? `(task: ${taskId}) ` : ''}${message.trim()}`;

    const logPath = bridgeLogPath();
    const logEntry = `\n[${new Date().toISOString()}] chat-send task=${taskId || 'controller'} msg="${message.trim().slice(0, 100)}"\n`;
    fs.appendFileSync(logPath, logEntry);

    const child = spawnAgent(controllerSessionId, msg, logPath);

    return Response.json({ ok: true, sent: true, pid: child.pid, taskId: taskId || 'controller' });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
