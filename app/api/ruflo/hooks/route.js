import { listHooks, runHooks } from '@/lib/ruflo/hooks';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const hooks = listHooks();
    return Response.json({ ok: true, hooks });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(request) {
  try {
    const { lifecycle, context } = await request.json();
    if (!lifecycle) return Response.json({ ok: false, error: 'lifecycle required' }, { status: 400 });
    const result = runHooks(lifecycle, context || {});
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
