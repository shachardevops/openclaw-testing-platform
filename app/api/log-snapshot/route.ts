import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { resultsDir } from '@/lib/config';
import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function snapshotsDir() {
  const { project } = getProjectConfig();
  const workspace = project.workspace || process.cwd();
  return path.join(workspace, 'log-snapshots');
}

/**
 * GET /api/log-snapshot?taskId=story-0&findingId=S0-B1
 *
 * Returns the stored app log snapshot for a specific finding.
 */
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get('taskId');
  const findingId = url.searchParams.get('findingId');

  if (!taskId) {
    return Response.json({ ok: false, error: 'taskId required' }, { status: 400 });
  }
  if (!SAFE_ID.test(taskId)) {
    return Response.json({ ok: false, error: 'Invalid taskId format' }, { status: 400 });
  }

  // If findingId given, return specific snapshot
  if (findingId) {
    const safeFinding = findingId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(snapshotsDir(), taskId, `${safeFinding}.txt`);
    if (!fs.existsSync(filePath)) {
      return Response.json({ ok: true, snapshot: null });
    }
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      return Response.json({ ok: true, snapshot: text });
    } catch (e: unknown) {
      return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  // No findingId — list all snapshots for the task
  const dir = path.join(snapshotsDir(), taskId);
  if (!fs.existsSync(dir)) {
    return Response.json({ ok: true, snapshots: {} });
  }
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    const snapshots: Record<string, string> = {};
    for (const file of files) {
      const id = file.replace('.txt', '');
      snapshots[id] = fs.readFileSync(path.join(dir, file), 'utf8');
    }
    return Response.json({ ok: true, snapshots });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
