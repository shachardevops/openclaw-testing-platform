/**
 * Browser Screencast — connects to OpenClaw's managed browser via CDP
 * and streams viewport frames using Page.startScreencast.
 *
 * Chrome only sends frames when pixels change, so this is efficient.
 */

import { WebSocket } from 'ws';

// Default CDP port for OpenClaw managed browser
const DEFAULT_CDP_PORT = 18800;

interface CDPTarget {
  type: string;
  url: string;
  title: string;
  id: string;
  webSocketDebuggerUrl: string;
}

interface DiscoveredTarget {
  wsUrl: string;
  pageUrl: string;
  title: string;
  targetId: string;
}

interface ListedTarget {
  id: string;
  url: string;
  title: string;
  wsUrl: string;
}

interface FrameMetadata {
  deviceWidth: number;
  deviceHeight: number;
  [key: string]: unknown;
}

interface FrameData {
  data: string;
  metadata: FrameMetadata;
  sessionId?: number;
}

interface ScreencastOptions {
  wsUrl: string;
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
  keepaliveMs?: number;
  onFrame: (frame: FrameData) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

interface ScreencastController {
  stop: () => void;
}

/**
 * Discover the CDP WebSocket URL for the active browser page.
 * OpenClaw's managed browser exposes /json/list on the CDP port.
 */
async function discoverTarget(cdpPort: number = DEFAULT_CDP_PORT): Promise<DiscoveredTarget> {
  const url = `http://127.0.0.1:${cdpPort}/json/list`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`CDP discovery failed: ${res.status}`);
  const targets: CDPTarget[] = await res.json();

  // Prefer the first "page" target that isn't a devtools or extension page
  const page = targets.find(
    (t) =>
      t.type === 'page' &&
      !t.url.startsWith('devtools://') &&
      !t.url.startsWith('chrome-extension://')
  );
  if (!page) throw new Error('No active browser page found');
  return {
    wsUrl: page.webSocketDebuggerUrl,
    pageUrl: page.url,
    title: page.title,
    targetId: page.id,
  };
}

/**
 * List all available page targets (for target picker).
 */
async function listTargets(cdpPort: number = DEFAULT_CDP_PORT): Promise<ListedTarget[]> {
  const url = `http://127.0.0.1:${cdpPort}/json/list`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`CDP discovery failed: ${res.status}`);
  const targets: CDPTarget[] = await res.json();
  return targets
    .filter(
      (t) =>
        t.type === 'page' &&
        !t.url.startsWith('devtools://') &&
        !t.url.startsWith('chrome-extension://')
    )
    .map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      wsUrl: t.webSocketDebuggerUrl,
    }));
}

/**
 * Start a screencast session. Returns a controller object.
 *
 * When `keepaliveMs` is set (default 10000), a `Page.captureScreenshot` is
 * fired whenever no screencast frame has arrived within that interval.
 * This guarantees frames even on completely static pages where CDP's
 * `Page.startScreencast` won't emit anything.
 */
function startScreencast(opts: ScreencastOptions): ScreencastController {
  const {
    wsUrl,
    format = 'jpeg',
    quality = 60,
    maxWidth = 1280,
    maxHeight = 900,
    everyNthFrame = 1,
    keepaliveMs = 10000,
    onFrame,
    onError,
    onClose,
  } = opts;

  let ws: WebSocket;
  let msgId = 1;
  let stopped = false;
  let lastFrameAt = Date.now();
  let lastMetadata: FrameMetadata = { deviceWidth: maxWidth, deviceHeight: maxHeight };
  const screenshotIds = new Set<number>();
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e: unknown) {
    onError?.(e as Error);
    return { stop: () => {} };
  }

  ws.on('open', () => {
    if (stopped) return;
    // Start the screencast
    ws.send(
      JSON.stringify({
        id: msgId++,
        method: 'Page.startScreencast',
        params: { format, quality, maxWidth, maxHeight, everyNthFrame },
      })
    );

    // Keepalive: periodically capture a screenshot if no frames arrive
    if (keepaliveMs > 0) {
      keepaliveTimer = setInterval(() => {
        if (stopped || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastFrameAt < keepaliveMs) return;
        const id = msgId++;
        screenshotIds.add(id);
        ws.send(
          JSON.stringify({
            id,
            method: 'Page.captureScreenshot',
            params: { format, quality },
          })
        );
      }, keepaliveMs);
    }
  });

  ws.on('message', (raw: Buffer) => {
    if (stopped) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.method === 'Page.screencastFrame') {
      const params = msg.params as { data: string; metadata: FrameMetadata; sessionId: number };
      const { data, metadata, sessionId } = params;
      lastFrameAt = Date.now();
      lastMetadata = metadata;
      // ACK the frame so Chrome sends the next one
      ws.send(
        JSON.stringify({
          id: msgId++,
          method: 'Page.screencastFrameAck',
          params: { sessionId },
        })
      );
      onFrame({ data, metadata, sessionId });
    }

    // Handle captureScreenshot response (keepalive fallback)
    if (msg.id && screenshotIds.has(msg.id as number) && (msg.result as Record<string, unknown>)?.data) {
      screenshotIds.delete(msg.id as number);
      lastFrameAt = Date.now();
      onFrame({ data: (msg.result as Record<string, unknown>).data as string, metadata: lastMetadata });
    }
  });

  ws.on('error', (e: Error) => {
    if (!stopped) onError?.(e);
  });

  ws.on('close', () => {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    if (!stopped) onClose?.();
  });

  return {
    stop() {
      stopped = true;
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            id: msgId++,
            method: 'Page.stopScreencast',
          })
        );
        ws.close();
      }
    },
  };
}

export { discoverTarget, listTargets, startScreencast, DEFAULT_CDP_PORT };
export type { DiscoveredTarget, ListedTarget, ScreencastOptions, ScreencastController, FrameData, FrameMetadata };
