import appHealth from '@/lib/app-health';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-start health monitor
appHealth.start();

export async function GET() {
  try {
    return Response.json({ ok: true, ...appHealth.getStatus() });
  } catch (e) {
    return toErrorResponse(e);
  }
}
