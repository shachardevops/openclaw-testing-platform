import { checkGatewayHealth } from '@/lib/openclaw-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await checkGatewayHealth();
  return Response.json(health);
}
