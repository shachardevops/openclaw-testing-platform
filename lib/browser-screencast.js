/**
 * Browser Screencast — connects to OpenClaw's managed browser via CDP
 * and streams viewport frames using Page.startScreencast.
 *
 * Chrome only sends frames when pixels change, so this is efficient.
 */

import { WebSocket } from 'ws';

// Default CDP port for OpenClaw managed browser
const DEFAULT_CDP_PORT = 18800;

/**
 * Discover the CDP WebSocket URL for the active browser page.
 * OpenClaw's managed browser exposes /json/list on the CDP port.
 */
async function discoverTarget(cdpPort = DEFAULT_CDP_PORT) {
  const url = `http://127.0.0.1:${cdpPort}/json/list`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`CDP discovery failed: ${res.status}`);
  const targets = await res.json();

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
async function listTargets(cdpPort = DEFAULT_CDP_PORT) {
  const url = `http://127.0.0.1:${cdpPort}/json/list`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`CDP discovery failed: ${res.status}`);
  const targets = await res.json();
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
 * @param {object} opts
 * @param {string} opts.wsUrl - CDP WebSocket URL for the target
 * @param {string} [opts.format='jpeg'] - Image format (jpeg|png)
 * @param {number} [opts.quality=60] - JPEG quality (0-100)
 * @param {number} [opts.maxWidth=1280] - Max frame width
 * @param {number} [opts.maxHeight=900] - Max frame height
 * @param {number} [opts.everyNthFrame=1] - Skip frames (1 = every frame)
 * @param {function} opts.onFrame - Called with { data, metadata, sessionId }
 * @param {function} [opts.onError] - Called on error
 * @param {function} [opts.onClose] - Called when connection closes
 */
/**
 * Start a screencast session. Returns a controller object.
 *
 * When `keepaliveMs` is set (default 10000), a `Page.captureScreenshot` is
 * fired whenever no screencast frame has arrived within that interval.
 * This guarantees frames even on completely static pages where CDP's
 * `Page.startScreencast` won't emit anything.
 */
function startScreencast(opts) {
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

  let ws;
  let msgId = 1;
  let stopped = false;
  let lastFrameAt = Date.now();
  let lastMetadata = { deviceWidth: maxWidth, deviceHeight: maxHeight };
  const screenshotIds = new Set();
  let keepaliveTimer = null;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    onError?.(e);
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

  ws.on('message', (raw) => {
    if (stopped) return;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.method === 'Page.screencastFrame') {
      const { data, metadata, sessionId } = msg.params;
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
    if (msg.id && screenshotIds.has(msg.id) && msg.result?.data) {
      screenshotIds.delete(msg.id);
      lastFrameAt = Date.now();
      onFrame({ data: msg.result.data, metadata: lastMetadata });
    }
  });

  ws.on('error', (e) => {
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
