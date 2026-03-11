import fs from 'fs';
import { appLogPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TAIL_BYTES = 128 * 1024;

export async function GET(request) {
  try {
    const logPath = appLogPath();
    const url = new URL(request.url);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const beforeParam = url.searchParams.get('before');
    const before = beforeParam !== null ? Math.max(0, Number(beforeParam)) : null;
    const limitParam = Number(url.searchParams.get('limitBytes') || DEFAULT_TAIL_BYTES);
    const limitBytes = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_TAIL_BYTES;

    if (!fs.existsSync(logPath)) {
      return Response.json({ ok: true, text: '', nextOffset: 0, headOffset: 0, truncatedHead: false, exists: false });
    }

    const size = Number(fs.statSync(logPath).size || 0);

    if (before !== null) {
      const end = Math.min(before, size);
      const start = Math.max(0, end - limitBytes);
      const length = Math.max(0, end - start);
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(length);
      if (length > 0) fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);

      return Response.json({
        ok: true,
        text: buf.toString('utf8'),
        nextOffset: size,
        headOffset: start,
        truncatedHead: start > 0,
        exists: true,
      });
    }

    let start = Math.min(offset, size);
    let truncatedHead = false;
    if (offset === 0 && size > limitBytes) {
      start = size - limitBytes;
      truncatedHead = true;
    }

    const length = Math.min(Math.max(0, size - start), 512 * 1024); // cap at 512KB
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(length);
    if (length > 0) fs.readSync(fd, buf, 0, length, start);
    fs.closeSync(fd);

    return Response.json({
      ok: true,
      text: buf.toString('utf8'),
      nextOffset: start + length,
      headOffset: truncatedHead ? start : 0,
      truncatedHead,
      exists: true,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
