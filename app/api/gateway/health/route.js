import { checkGatewayHealth } from '@/lib/openclaw-gateway';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await checkGatewayHealth();
    return Response.json(health);
  } catch (e) {
    return toErrorResponse(e);
  }
}
