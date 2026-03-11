import fs from 'fs';
import path from 'path';
import { resultsDir } from '@/lib/config';
import { getTaskIdSet } from '@/lib/project-loader';

export const runtime = 'nodejs';

const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]+$/;

export async function POST(request, { params }) {
  try {
    const { agentId } = await params;
    if (!SAFE_AGENT_ID.test(agentId)) {
      return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });
    }
    const data = await request.json();
    const rDir = resultsDir();
    if (!fs.existsSync(rDir)) fs.mkdirSync(rDir, { recursive: true });

    // ── System actions ──────────────────────────────────────────
    if (agentId === 'system') {
      const nowMs = Number(data.timestamp || Date.now());
      const taskIds = getTaskIdSet();

      if (data.action === 'reset') {
        const files = fs.readdirSync(rDir).filter(f => f.endsWith('.json') && f !== 'system.json');
        files.forEach(f => fs.rmSync(path.join(rDir, f), { force: true }));
        fs.writeFileSync(path.join(rDir, 'system.json'), JSON.stringify({
          action: 'reset', suppressStoriesBeforeMs: nowMs, timestamp: nowMs,
        }, null, 2));
        return Response.json({ ok: true, cleared: files.length });
      }

      // Generic clean-all-tasks (with backwards compat alias)
      if (data.action === 'clean-all-tasks' || data.action === 'clean-all-stories') {
        const files = fs.readdirSync(rDir).filter(f => {
          const key = f.replace('.json', '');
          return f.endsWith('.json') && taskIds.has(key);
        });
        files.forEach(f => fs.rmSync(path.join(rDir, f), { force: true }));
        fs.writeFileSync(path.join(rDir, 'system.json'), JSON.stringify({
          action: 'clean-all-tasks', cleaned: files.length, suppressStoriesBeforeMs: nowMs, timestamp: nowMs,
        }, null, 2));
        return Response.json({ ok: true, cleaned: files.length });
      }

      // Default system write
      fs.writeFileSync(path.join(rDir, 'system.json'), JSON.stringify(data, null, 2));
      return Response.json({ ok: true });
    }

    // ── Default: write task result ──────────────────────────────
    fs.writeFileSync(path.join(rDir, `${agentId}.json`), JSON.stringify(data, null, 2));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
