import fs from 'fs';
import {
  startRecording,
  stopRecording,
  addRecordingEvent,
  syncRecordingFindings,
  getRecordingStatus,
  listRecordings,
  loadManifest,
  getFramePath,
  recordingExists,
} from '@/lib/screencast-recorder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/recording
 *
 * Query params:
 *   action=list      — list all recordings
 *   action=status    — get status of active recording (requires taskId)
 *   action=manifest  — get saved recording manifest (requires taskId)
 *   action=frame     — get a single frame image (requires taskId + file)
 */
export async function GET(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'list';
  const taskId = url.searchParams.get('taskId');

  if (action === 'list') {
    return Response.json({ ok: true, ...listRecordings() });
  }

  if (action === 'status') {
    if (!taskId) return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });
    const status = getRecordingStatus(taskId);
    if (!status) return Response.json({ ok: true, recording: false });
    return Response.json({ ok: true, recording: true, ...status });
  }

  if (action === 'exists') {
    if (!taskId) return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });
    return Response.json({ ok: true, exists: recordingExists(taskId) });
  }

  if (action === 'manifest') {
    if (!taskId) return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });
    const manifest = loadManifest(taskId);
    if (!manifest) return Response.json({ ok: false, error: 'Recording not found' }, { status: 404 });
    return Response.json({ ok: true, manifest });
  }

  if (action === 'frame') {
    if (!taskId) return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });
    const file = url.searchParams.get('file');
    if (!file) return Response.json({ ok: false, error: 'file required' }, { status: 400 });

    // Sanitize filename
    const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '');
    const framePath = getFramePath(taskId, safeName);
    if (!framePath) return new Response('Not found', { status: 404 });

    const data = fs.readFileSync(framePath);
    return new Response(data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}

/**
 * POST /api/recording
 *
 * Body:
 *   { action: 'start', taskId, opts? }
 *   { action: 'stop', taskId }
 *   { action: 'event', taskId, type, data }
 *   { action: 'sync-findings', taskId }
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, taskId } = body;
  if (!action) return Response.json({ ok: false, error: 'action required' }, { status: 400 });
  if (!taskId) return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });

  if (action === 'start') {
    const result = await startRecording(taskId, body.opts);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }

  if (action === 'stop') {
    const result = stopRecording(taskId);
    return Response.json(result);
  }

  if (action === 'event') {
    addRecordingEvent(taskId, body.type, body.data);
    return Response.json({ ok: true });
  }

  if (action === 'sync-findings') {
    syncRecordingFindings(taskId);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
