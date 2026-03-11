import fs from 'fs';
import path from 'path';
import { reportsDir } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const agentId = (new URL(request.url).searchParams.get('agentId') || '').trim();
  if (!agentId) return Response.json({ ok: false, error: 'agentId required' }, { status: 400 });

  const reportPath = path.join(reportsDir(), `${agentId}.md`);
  try {
    const content = fs.readFileSync(reportPath, 'utf8');
    return Response.json({ ok: true, content, path: reportPath });
  } catch {
    return Response.json({ ok: false, error: 'Report not found', path: reportPath }, { status: 404 });
  }
}
