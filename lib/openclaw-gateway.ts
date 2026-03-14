import fs from 'fs';
import path from 'path';

const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '~', '.openclaw', 'openclaw.json');
const DEFAULT_PORT = 18789;

interface GatewayConfig {
  port: number;
  token: string | null;
  authMode: string;
}

let _gatewayConfig: GatewayConfig | null = null;
let _gatewayConfigReadAt = 0;
const CONFIG_TTL_MS = 15000;

export function getGatewayConfig(): GatewayConfig {
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

interface HealthResult {
  available: boolean;
  port: number;
  endpointsEnabled: boolean;
  reason?: string;
  instructions?: string;
}

export async function checkGatewayHealth(): Promise<HealthResult> {
  const config = getGatewayConfig();
  const baseUrl = `http://localhost:${config.port}`;

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

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

    if (res.status === 404) {
      return {
        available: true,
        port: config.port,
        endpointsEnabled: false,
        reason: 'endpoints_disabled',
        instructions: `The /v1/chat/completions endpoint is not enabled. Check gateway HTTP endpoint configuration.`,
      };
    }

    return { available: true, port: config.port, endpointsEnabled: true };
  } catch {
    return { available: true, port: config.port, endpointsEnabled: false, reason: 'probe_failed' };
  }
}

export async function streamChat(agentId: string | null, message: string, opts: { user?: string } = {}): Promise<ReadableStream<Uint8Array> | null> {
  const config = getGatewayConfig();
  const baseUrl = `http://localhost:${config.port}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.token) headers['Authorization'] = `Bearer ${config.token}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;

  const body: Record<string, any> = {
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
    throw new Error(`Gateway error ${res.status}: ${errText}`);
  }

  return res.body;
}

export async function sendChat(agentId: string | null, message: string, opts: { user?: string; sessionKey?: string } = {}): Promise<any> {
  const config = getGatewayConfig();
  const baseUrl = `http://localhost:${config.port}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.token) headers['Authorization'] = `Bearer ${config.token}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;

  const body: Record<string, any> = {
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
    throw new Error(`Gateway error ${res.status}: ${errText}`);
  }

  return res.json();
}
