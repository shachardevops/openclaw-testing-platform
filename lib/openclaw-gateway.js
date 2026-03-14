import fs from 'fs';
import path from 'path';
import { GatewayError } from '@/lib/ruflo/errors';
import { withRetry } from '@/lib/ruflo/retry';

const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '~', '.openclaw', 'openclaw.json');
const DEFAULT_PORT = 18789;

let _gatewayConfig = null;
let _gatewayConfigReadAt = 0;
const CONFIG_TTL_MS = 15000; // Re-read config every 15s

/**
 * Read gateway config from ~/.openclaw/openclaw.json
 */
export function getGatewayConfig() {
  const now = Date.now();
  if (_gatewayConfig && now - _gatewayConfigReadAt < CONFIG_TTL_MS) return _gatewayConfig;
  try {
    const raw = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    _gatewayConfig = {
      port: raw?.gateway?.port || DEFAULT_PORT,
      token: raw?.gateway?.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN || null,
      authMode: raw?.gateway?.auth?.mode || 'none',
    };
  } catch {
    _gatewayConfig = {
      port: process.env.OPENCLAW_GATEWAY_PORT && Number.isFinite(Number(process.env.OPENCLAW_GATEWAY_PORT))
        ? Number(process.env.OPENCLAW_GATEWAY_PORT)
        : DEFAULT_PORT,
      token: process.env.OPENCLAW_GATEWAY_TOKEN || null,
      authMode: 'none',
    };
  }
  _gatewayConfigReadAt = now;
  return _gatewayConfig;
}

/**
 * Check if gateway is reachable and chat completions endpoint works.
 */
export async function checkGatewayHealth() {
  const config = getGatewayConfig();
  const baseUrl = `http://localhost:${config.port}`;

  // 1. Check if gateway process is reachable
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeout);

    if (!res || !res.ok) {
      return { available: false, port: config.port, endpointsEnabled: false, reason: 'unreachable' };
    }
  } catch {
    return { available: false, port: config.port, endpointsEnabled: false, reason: 'unreachable' };
  }

  // 2. Probe the chat completions endpoint with a minimal request
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'openclaw', messages: [], stream: false, max_tokens: 1 }),
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    if (!res) {
      return { available: true, port: config.port, endpointsEnabled: false, reason: 'endpoint_unreachable' };
    }

    // 404 = endpoint not enabled, 400/422 = endpoint exists (bad request is fine),
    // 401/403 = auth issue, 200 = works
    if (res.status === 404) {
      return {
        available: true,
        port: config.port,
        endpointsEnabled: false,
        reason: 'endpoints_disabled',
        instructions: `The /v1/chat/completions endpoint is not enabled. Check gateway HTTP endpoint configuration.`,
      };
    }

    // Any non-404 response means the endpoint exists
    return { available: true, port: config.port, endpointsEnabled: true };
  } catch {
    return { available: true, port: config.port, endpointsEnabled: false, reason: 'probe_failed' };
  }
}

/**
 * Stream a chat completion from the gateway.
 * Returns the fetch Response (with body as ReadableStream).
 */
export async function streamChat(agentId, message, opts = {}) {
  return withRetry(async () => {
    const config = getGatewayConfig();
    const baseUrl = `http://localhost:${config.port}`;

    const headers = { 'Content-Type': 'application/json' };
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`;
    if (agentId) headers['x-openclaw-agent-id'] = agentId;

    const body = {
      model: agentId ? `openclaw:${agentId}` : 'openclaw',
      messages: [{ role: 'user', content: message }],
      stream: true,
    };

    if (opts.user) body.user = opts.user;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new GatewayError(`Gateway error ${res.status}: ${errText}`);
    }

    return res.body;
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}

/**
 * Send a non-streaming chat completion.
 */
export async function sendChat(agentId, message, opts = {}) {
  return withRetry(async () => {
    const config = getGatewayConfig();
    const baseUrl = `http://localhost:${config.port}`;

    const headers = { 'Content-Type': 'application/json' };
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`;
    if (agentId) headers['x-openclaw-agent-id'] = agentId;

    const body = {
      model: agentId ? `openclaw:${agentId}` : 'openclaw',
      messages: [{ role: 'user', content: message }],
      stream: false,
    };

    if (opts.user) body.user = opts.user;
    if (opts.sessionKey) headers['x-openclaw-session-key'] = opts.sessionKey;

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new GatewayError(`Gateway error ${res.status}: ${errText}`);
    }

    return res.json();
  }, { maxAttempts: 3, baseDelayMs: 1000 });
}
