import fs from 'fs';
import { NextRequest } from 'next/server';
import { bridgeLogPath } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CHUNK = 512 * 1024;

export async function GET(request: NextRequest) {
  const logPath = bridgeLogPath();
  let offset = Math.max(0, Number(new URL(request.url).searchParams.get('offset') || 0));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        payload.ts = new Date().toISOString();
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch {}
      };

      const readDelta = (forceSend: boolean) => {
        try {
          if (!fs.existsSync(logPath)) {
            if (forceSend) send({ ok: true, text: '', nextOffset: 0, exists: false });
            return;
          }
          const size = Number(fs.statSync(logPath).size || 0);
          if (size < offset) offset = 0;
          const length = Math.min(Math.max(0, size - offset), MAX_CHUNK);
          if (length > 0) {
            const fd = fs.openSync(logPath, 'r');
            let buf: Buffer;
            try {
              buf = Buffer.alloc(length);
              fs.readSync(fd, buf, 0, length, offset);
            } finally {
              fs.closeSync(fd);
            }
            offset += length;
            send({ ok: true, text: buf.toString('utf8'), nextOffset: offset, exists: true });
          }
        } catch (e: unknown) {
          send({ ok: false, error: (e as Error).message });
        }
      };

      readDelta(true);
      const timer = setInterval(() => readDelta(false), 3000);
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      };

      // Max 10 min lifetime to prevent connection leaks
      const maxLifetime = setTimeout(cleanup, 600_000);
      request.signal.addEventListener('abort', () => {
        clearTimeout(maxLifetime);
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
