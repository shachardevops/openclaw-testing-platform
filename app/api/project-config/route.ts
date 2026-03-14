import { getProjectConfig } from '@/lib/project-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getProjectConfig();
  return Response.json(config);
}
