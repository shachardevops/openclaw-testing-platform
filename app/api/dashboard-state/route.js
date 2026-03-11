import fs from 'fs';
import path from 'path';
import { statePath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY = { taskSkills: {}, taskModels: {}, customPipelines: [] };

function read() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); }
  catch { return { ...EMPTY }; }
}

function write(state) {
  const fp = statePath();
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2));
}

export async function GET() {
  return Response.json(read());
}

export async function POST(request) {
  try {
    const body = await request.json();
    const cur = read();
    const updated = {
      taskSkills: body.taskSkills ?? cur.taskSkills,
      taskModels: body.taskModels ?? cur.taskModels,
      customPipelines: body.customPipelines ?? cur.customPipelines,
    };
    write(updated);
    return Response.json({ ok: true, ...updated });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }
}
