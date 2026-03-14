import appHealth from '@/lib/app-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-start health monitor
appHealth.start();

export async function GET() {
  return Response.json({ ok: true, ...appHealth.getStatus() });
}
