import fs from 'fs';
import path from 'path';
import {
  discoverTarget,
  listTargets,
  startScreencast,
  DEFAULT_CDP_PORT,
} from '@/lib/browser-screencast';
import { resultsDir } from '@/lib/config';
import { listSessionsSync } from '@/lib/openclaw';
import sessionManager from '@/lib/session-manager';
import orchestratorEngine from '@/lib/orchestrator-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ensureCoordinationStarted() {
  sessionManager.start();
  orchestratorEngine.start();
}

function readTaskResult(taskId) {
  try {
    const resultPath = path.join(resultsDir(), `${taskId}.json`);
    if (!fs.existsSync(resultPath)) return null;
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveManagedTaskTarget(taskId) {
  ensureCoordinationStarted();

  const result = readTaskResult(taskId);
  if (!result || result.status !== 'running') {
    throw new Error(`Task ${taskId} is not running`);
  }

  return {
    targetId: result.cdpTargetId || null,
    taskId,
  };
}

/**
 * GET /api/browser-screencast
 *
 * Query params:
 *   mode=stream  — SSE stream of screencast frames (default)
 *   mode=targets — JSON list of available browser pages
 *   mode=status  — JSON with current browser connection status
 *   targetId     — specific CDP target ID (optional, auto-discovers if omitted)
 *   quality      — JPEG quality 1-100 (default: 55)
 *   maxWidth     — max frame width (default: 1280)
 *   maxHeight    — max frame height (default: 900)
 *   fps          — approx max fps via everyNthFrame (default: 4)
 */
export async function GET(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'stream';
  const cdpPort = parseInt(url.searchParams.get('cdpPort') || DEFAULT_CDP_PORT, 10);
  const taskId = url.searchParams.get('taskId');

  // ── Targets list ────────────────────────────────────────────
  if (mode === 'targets') {
    try {
      const targets = await listTargets(cdpPort);
      return Response.json({ ok: true, targets });
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 502 });
    }
  }

  // ── Status check ────────────────────────────────────────────
  if (mode === 'status') {
    try {
      if (taskId) {
        const managed = resolveManagedTaskTarget(taskId);
        if (managed.targetId) {
          const targets = await listTargets(cdpPort);
          const target = targets.find((candidate) => candidate.id === managed.targetId);
          if (target) {
            return Response.json({ ok: true, connected: true, managed: true, ...managed, ...target });
          }
        }
        // Fallback: auto-discover any available browser target
        const target = await discoverTarget(cdpPort);
        return Response.json({ ok: true, connected: true, managed: true, discovered: true, ...managed, ...target });
      }

      const target = await discoverTarget(cdpPort);
      return Response.json({ ok: true, connected: true, managed: false, ...target });
    } catch (e) {
      return Response.json({ ok: true, connected: false, error: e.message });
    }
  }

  // ── SSE stream ──────────────────────────────────────────────
  const quality = parseInt(url.searchParams.get('quality') || '55', 10);
  const maxWidth = parseInt(url.searchParams.get('maxWidth') || '1280', 10);
  const maxHeight = parseInt(url.searchParams.get('maxHeight') || '900', 10);
  const fps = parseInt(url.searchParams.get('fps') || '4', 10);
  const everyNthFrame = Math.max(1, Math.round(15 / fps)); // Chrome sends ~15fps max
  const targetId = url.searchParams.get('targetId');

  let target;
  try {
    if (taskId) {
      const managed = resolveManagedTaskTarget(taskId);
      if (managed.targetId) {
        // Try the stored CDP target first
        const targets = await listTargets(cdpPort);
        target = targets.find((t) => t.id === managed.targetId);
      }
      // Fallback: auto-discover any available browser target
      if (!target) {
        target = await discoverTarget(cdpPort);
        // Persist discovered target ID for future lookups
        try {
          const resultPath = path.join(resultsDir(), `${taskId}.json`);
          if (fs.existsSync(resultPath)) {
            const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            if (!data.cdpTargetId && target.id) {
              data.cdpTargetId = target.id;
              fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
            }
          }
        } catch { /* best-effort */ }
      }
    } else {
      if (targetId) {
        const targets = await listTargets(cdpPort);
        target = targets.find((t) => t.id === targetId);
        if (!target) throw new Error(`Target ${targetId} not found`);
      } else {
        target = await discoverTarget(cdpPort);
      }
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 502 });
  }

  // Set up SSE stream
  const encoder = new TextEncoder();
  let screencastCtrl;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            pageUrl: target.pageUrl || target.url,
            title: target.title,
            targetId: target.targetId || target.id,
          })}\n\n`
        )
      );

      screencastCtrl = startScreencast({
        wsUrl: target.wsUrl,
        format: 'jpeg',
        quality,
        maxWidth,
        maxHeight,
        everyNthFrame,
        onFrame({ data, metadata }) {
          try {
            controller.enqueue(
              encoder.encode(
                `event: frame\ndata: ${JSON.stringify({
                  image: data,
                  ts: metadata.timestamp,
                  x: metadata.offsetTop,
                  y: metadata.offsetLeft,
                  w: metadata.deviceWidth,
                  h: metadata.deviceHeight,
                  scale: metadata.pageScaleFactor,
                })}\n\n`
              )
            );
          } catch {
            // Stream closed
          }
        },
        onError(e) {
          try {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`)
            );
            controller.close();
          } catch {
            // Already closed
          }
        },
        onClose() {
          try {
            controller.enqueue(encoder.encode(`event: disconnected\ndata: {}\n\n`));
            controller.close();
          } catch {
            // Already closed
          }
        },
      });
    },
    cancel() {
      screencastCtrl?.stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
