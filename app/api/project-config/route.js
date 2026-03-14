import { getProjectConfig } from '@/lib/project-loader';
import { toErrorResponse } from '@/lib/ruflo/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = getProjectConfig();
    return Response.json(config);
  } catch (e) {
    return toErrorResponse(e);
  }
}
