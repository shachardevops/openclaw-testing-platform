import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
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

function readTaskResult(taskId: string) {
  try {
    const resultPath = path.join(resultsDir(), `${taskId}.json`);
    if (!fs.existsSync(resultPath)) return null;
    return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveManagedTaskTarget(taskId: string) {
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
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'stream';
  const cdpPort = parseInt(url.searchParams.get('cdpPort') || String(DEFAULT_CDP_PORT), 10);
  const taskId = url.searchParams.get('taskId');

  // ── Targets list ────────────────────────────────────────────
  if (mode === 'targets') {
    try {
      const targets = await listTargets(cdpPort);
      return Response.json({ ok: true, targets });
    } catch (e: unknown) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
    }
  }

  // ── Status check ────────────────────────────────────────────
  if (mode === 'status') {
    try {
      if (taskId) {
        const managed = resolveManagedTaskTarget(taskId);
        if (managed.targetId) {
          const targets = await listTargets(cdpPort);
          const target = targets.find((candidate: { id: string }) => candidate.id === managed.targetId);
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
    } catch (e: unknown) {
      return Response.json({ ok: true, connected: false, error: (e as Error).message });
    }
  }

  // ── SSE stream ──────────────────────────────────────────────
  const quality = parseInt(url.searchParams.get('quality') || '55', 10);
  const maxWidth = parseInt(url.searchParams.get('maxWidth') || '1280', 10);
  const maxHeight = parseInt(url.searchParams.get('maxHeight') || '900', 10);
  const fps = parseInt(url.searchParams.get('fps') || '4', 10);
  const everyNthFrame = Math.max(1, Math.round(15 / fps)); // Chrome sends ~15fps max
  const targetId = url.searchParams.get('targetId');

  let target: any;
  try {
    if (taskId) {
      const managed = resolveManagedTaskTarget(taskId);
      if (managed.targetId) {
        // Try the stored CDP target first
        const targets = await listTargets(cdpPort);
        target = targets.find((t: { id: string }) => t.id === managed.targetId);
      }
      // Fallback: auto-discover any available browser target
      if (!target) {
        target = await discoverTarget(cdpPort);
        // Persist discovered target ID for future lookups
        try {
          const resultPath = path.join(resultsDir(), `${taskId}.json`);
          if (fs.existsSync(resultPath)) {
            const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            if (!data.cdpTargetId && (target as Record<string, unknown>).id) {
              data.cdpTargetId = (target as Record<string, unknown>).id;
              fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
            }
          }
        } catch { /* best-effort */ }
      }
    } else {
      if (targetId) {
        const targets = await listTargets(cdpPort);
        target = targets.find((t: { id: string }) => t.id === targetId);
        if (!target) throw new Error(`Target ${targetId} not found`);
      } else {
        target = await discoverTarget(cdpPort);
      }
    }
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  // Set up SSE stream
  const encoder = new TextEncoder();
  let screencastCtrl: { stop: () => void } | undefined;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            pageUrl: (target as Record<string, unknown>).pageUrl || (target as Record<string, unknown>).url,
            title: (target as Record<string, unknown>).title,
            targetId: (target as Record<string, unknown>).targetId || (target as Record<string, unknown>).id,
          })}\n\n`
        )
      );

      screencastCtrl = startScreencast({
        wsUrl: (target as Record<string, unknown>).wsUrl as string,
        format: 'jpeg',
        quality,
        maxWidth,
        maxHeight,
        everyNthFrame,
        onFrame({ data, metadata }: { data: string; metadata: Record<string, unknown> }) {
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
        onError(e: Error) {
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
