import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { reportsDir } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export async function GET(request: NextRequest) {
  const agentId = (new URL(request.url).searchParams.get('agentId') || '').trim();
  if (!agentId) return Response.json({ ok: false, error: 'agentId required' }, { status: 400 });
  if (!SAFE_ID.test(agentId)) return Response.json({ ok: false, error: 'Invalid agentId format' }, { status: 400 });

  const reportPath = path.join(reportsDir(), `${agentId}.md`);
  try {
    const content = fs.readFileSync(reportPath, 'utf8');
    return Response.json({ ok: true, content });
  } catch {
    return Response.json({ ok: false, error: 'Report not found' }, { status: 404 });
  }
}
