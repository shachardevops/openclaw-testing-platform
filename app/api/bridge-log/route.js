import fs from 'fs';
import { bridgeLogPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const logPath = bridgeLogPath();
    const offset = Math.max(0, Number(new URL(request.url).searchParams.get('offset') || 0));

    if (!fs.existsSync(logPath)) {
      return Response.json({ ok: true, text: '', nextOffset: 0, exists: false });
    }

    const size = Number(fs.statSync(logPath).size || 0);
    const start = Math.min(offset, size);
    const length = Math.max(0, size - start);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(length);
    if (length > 0) fs.readSync(fd, buf, 0, length, start);
    fs.closeSync(fd);

    return Response.json({ ok: true, text: buf.toString('utf8'), nextOffset: size, exists: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
