import fs from 'fs';
import path from 'path';
import { reportsDir } from '@/lib/config';
import { isIdSafe } from '@/lib/security-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolvePath(agentId) {
  const testDir = process.env.TEST_PLANS_DIR;
  if (testDir) {
    // Check if a file matches this agent in the test plans directory
    try {
      const files = fs.readdirSync(testDir).filter(f => f.endsWith('.md'));
      const match = files.find(f => f.toLowerCase().startsWith(agentId.toLowerCase()));
      if (match) {
        const resolved = path.join(testDir, match);
        if (!resolved.startsWith(testDir)) return null;
        return resolved;
      }
    } catch {}
  }
  const base = reportsDir();
  const resolved = path.join(base, `${agentId}.md`);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

export async function GET(request) {
  const agentId = (new URL(request.url).searchParams.get('agentId') || '').trim();
  if (!agentId) return Response.json({ ok: false, error: 'agentId required' }, { status: 400 });
  if (!isIdSafe(agentId)) return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });

  const fp = resolvePath(agentId);
  if (!fp) return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });
  try {
    const content = fs.readFileSync(fp, 'utf8');
    return Response.json({ ok: true, agentId, path: fp, content });
  } catch (e) {
    if (e.code === 'ENOENT') return Response.json({ ok: true, agentId, path: fp, content: '' });
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const agentId = (new URL(request.url).searchParams.get('agentId') || '').trim();
  if (!agentId) return Response.json({ ok: false, error: 'agentId required' }, { status: 400 });
  if (!isIdSafe(agentId)) return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });

  try {
    const { content } = await request.json();
    if (typeof content !== 'string') throw new Error('content required');
    const fp = resolvePath(agentId);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, content, 'utf8');
    return Response.json({ ok: true, agentId, path: fp });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
