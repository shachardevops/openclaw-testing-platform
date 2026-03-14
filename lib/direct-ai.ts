import fs from 'fs';
import path from 'path';
import os from 'os';

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

interface TokenConfig {
  anthropicKey: string | null;
  openaiKey: string | null;
  defaultClaudeModel: string;
  defaultCodexModel: string;
}

let _configCache: TokenConfig | null = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 30000;

function resolveTokens(): TokenConfig {
  const now = Date.now();
  if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;

  let openclawConfig: any = null;
  try {
    openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    // Config file not found
  }

  _configCache = {
    anthropicKey:
      process.env.ANTHROPIC_API_KEY ||
      openclawConfig?.providers?.anthropic?.apiKey ||
      openclawConfig?.apiKeys?.anthropic ||
      openclawConfig?.keys?.anthropic ||
      null,
    openaiKey:
      process.env.OPENAI_API_KEY ||
      openclawConfig?.providers?.openai?.apiKey ||
      openclawConfig?.apiKeys?.openai ||
      openclawConfig?.keys?.openai ||
      null,
    defaultClaudeModel:
      process.env.DIRECT_AI_CLAUDE_MODEL ||
      openclawConfig?.directAI?.claudeModel ||
      'claude-sonnet-4-6',
    defaultCodexModel:
      process.env.DIRECT_AI_CODEX_MODEL ||
      openclawConfig?.directAI?.codexModel ||
      'gpt-4.1',
  };
  _configCacheAt = now;
  return _configCache;
}

let _anthropicClient: any = null;
let _openaiClient: any = null;

function getAnthropicClient(): any {
  if (_anthropicClient) return _anthropicClient;
  const tokens = resolveTokens();
  if (!tokens.anthropicKey) return null;
  const { default: Anthropic } = require('@anthropic-ai/sdk');
  _anthropicClient = new Anthropic({ apiKey: tokens.anthropicKey });
  return _anthropicClient;
}

function getOpenAIClient(): any {
  if (_openaiClient) return _openaiClient;
  const tokens = resolveTokens();
  if (!tokens.openaiKey) return null;
  const { default: OpenAI } = require('openai');
  _openaiClient = new OpenAI({ apiKey: tokens.openaiKey });
  return _openaiClient;
}

const MODEL_TIERS: Record<string, Record<string, string>> = {
  claude: {
    simple: 'claude-haiku-4-5',
    medium: 'claude-sonnet-4-6',
    complex: 'claude-opus-4-6',
  },
  codex: {
    simple: 'gpt-4.1-mini',
    medium: 'gpt-4.1',
    complex: 'gpt-4.1',
  },
};

function classifyComplexity(prompt: string, opts: { complexity?: string } = {}): string {
  if (opts.complexity) return opts.complexity;

  const len = prompt.length;
  const lines = prompt.split('\n').length;

  if (len < 200 && lines <= 5) return 'simple';
  if (/\b(yes|no|true|false|pass|fail)\b.*\bonly\b/i.test(prompt)) return 'simple';
  if (/respond with (only|just)/i.test(prompt)) return 'simple';

  if (len > 2000) return 'complex';
  if (lines > 30) return 'complex';
  if (/\b(analyze|explain|design|architect|refactor|debug)\b/i.test(prompt) && len > 500) return 'complex';

  return 'medium';
}

function selectModel(provider: string, prompt: string, opts: { model?: string; complexity?: string } = {}): string {
  if (opts.model) return opts.model;

  const complexity = classifyComplexity(prompt, opts);
  const tier = MODEL_TIERS[provider] || MODEL_TIERS.claude;
  return tier[complexity];
}

let _vectorMemory: any = null;

function getVectorMemory(): any {
  if (_vectorMemory !== undefined && _vectorMemory !== null) return _vectorMemory;
  try {
    _vectorMemory = require('./vector-memory.js').default;
    return _vectorMemory;
  } catch {
    _vectorMemory = null;
    return null;
  }
}

interface AIResult {
  text: string;
  model: string;
  provider: string;
  usage: any;
}

async function checkSemanticCache(prompt: string, threshold: number = 0.85): Promise<AIResult | null> {
  const vm = getVectorMemory();
  if (!vm) return null;

  try {
    const results = await vm.searchDecisions(prompt, 3);
    if (!results || results.length === 0) return null;

    const best = results[0];
    if (best.similarity >= threshold && best.metadata?.response) {
      console.log(`[direct-ai] Semantic cache hit (similarity=${best.similarity.toFixed(3)}): ${prompt.slice(0, 60)}...`);
      return {
        text: best.metadata.response,
        provider: 'cache',
        model: best.metadata.model || 'cached',
        usage: { cached: true, similarity: best.similarity },
      };
    }
  } catch {
    // Vector DB not available
  }
  return null;
}

async function cacheResponse(prompt: string, result: AIResult | null): Promise<void> {
  const vm = getVectorMemory();
  if (!vm || !result?.text) return;

  try {
    const id = `direct-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await vm.addDecision(id, prompt, {
      response: result.text,
      model: result.model,
      provider: result.provider,
      cachedAt: new Date().toISOString(),
    });
  } catch {
    // Non-critical
  }
}

let _tokenTracker: any = null;

function getTokenTracker(): any {
  if (_tokenTracker !== undefined && _tokenTracker !== null) return _tokenTracker;
  try {
    _tokenTracker = require('./token-tracker').default;
    return _tokenTracker;
  } catch {
    _tokenTracker = null;
    return null;
  }
}

function trackUsage(result: AIResult | null, opts: { taskId?: string } = {}): void {
  const tracker = getTokenTracker();
  if (!tracker || !result) return;

  try {
    const taskId = opts.taskId || 'direct-ai';
    tracker.recordTaskCompletion(taskId, {
      model: result.model || 'unknown',
      provider: result.provider,
      tokenUsage: result.usage,
    });
  } catch {
    // Non-critical
  }
}

export function getAvailableProviders() {
  const tokens = resolveTokens();
  return {
    claude: !!tokens.anthropicKey,
    codex: !!tokens.openaiKey,
    defaultClaudeModel: tokens.defaultClaudeModel,
    defaultCodexModel: tokens.defaultCodexModel,
  };
}

export async function askClaude(prompt: string, opts: Record<string, any> = {}): Promise<AIResult | null> {
  const client = getAnthropicClient();
  if (!client) return null;

  const model = selectModel('claude', prompt, opts);

  try {
    const params: any = {
      model,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    };
    if (opts.system) params.system = opts.system;

    const response = await client.messages.create(params);
    const text = response.content
      ?.filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('') || '';

    return {
      text,
      model: response.model,
      provider: 'claude',
      usage: response.usage,
    };
  } catch (e: unknown) {
    console.error('[direct-ai] Claude call failed:', (e as Error).message);
    return null;
  }
}

export async function askCodex(prompt: string, opts: Record<string, any> = {}): Promise<AIResult | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const model = selectModel('codex', prompt, opts);

  try {
    const messages: any[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0,
    });

    const text = response.choices?.[0]?.message?.content?.trim() || '';

    return {
      text,
      model: response.model,
      provider: 'codex',
      usage: response.usage,
    };
  } catch (e: unknown) {
    console.error('[direct-ai] Codex call failed:', (e as Error).message);
    return null;
  }
}

export async function ask(prompt: string, opts: Record<string, any> = {}): Promise<AIResult | null> {
  _stats.totalCalls++;
  const complexity = classifyComplexity(prompt, opts);

  if (opts.useCache !== false) {
    const cached = await checkSemanticCache(prompt, opts.cacheThreshold);
    if (cached) {
      _stats.cacheHits++;
      _stats.estimatedCostSaved += 0.002;
      recordDecision({
        type: 'cache-hit',
        complexity,
        prompt: prompt.slice(0, 100),
        provider: 'cache',
        model: cached.model,
        similarity: cached.usage?.similarity,
      });
      trackUsage(cached, opts);
      return cached;
    }
  }

  const providers = getAvailableProviders();
  const taskType = opts.taskType || 'auto';
  let result: AIResult | null = null;
  let routedTo: string | null = null;

  if (taskType === 'code' && providers.codex) {
    routedTo = 'codex';
    result = await askCodex(prompt, opts);
  } else if (taskType === 'reasoning' && providers.claude) {
    routedTo = 'claude';
    result = await askClaude(prompt, opts);
  } else {
    if (providers.claude) {
      routedTo = 'claude';
      result = await askClaude(prompt, opts);
    }
    if (!result && providers.codex) {
      routedTo = 'codex';
      result = await askCodex(prompt, opts);
    }
  }

  if (result) {
    if (result.provider === 'claude') _stats.claudeCalls++;
    if (result.provider === 'codex') _stats.codexCalls++;
    if (result.usage) {
      _stats.totalInputTokens += result.usage.input_tokens || result.usage.prompt_tokens || 0;
      _stats.totalOutputTokens += result.usage.output_tokens || result.usage.completion_tokens || 0;
    }
    recordDecision({
      type: 'direct-call',
      complexity,
      prompt: prompt.slice(0, 100),
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage?.input_tokens || result.usage?.prompt_tokens || 0,
      outputTokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
    });
    if (opts.useCache !== false) cacheResponse(prompt, result);
    trackUsage(result, opts);
  } else {
    _stats.errors++;
    recordDecision({
      type: 'error',
      complexity,
      prompt: prompt.slice(0, 100),
      provider: routedTo || 'none',
      error: 'No response from any provider',
    });
  }

  return result;
}

export async function askWithGatewayFallback(agentId: string | null, prompt: string, opts: Record<string, any> = {}): Promise<any> {
  const result = await ask(prompt, opts);
  if (result) {
    return {
      choices: [{ message: { content: result.text } }],
      _provider: result.provider,
      _model: result.model,
      _usage: result.usage,
    };
  }

  try {
    _stats.gatewayFallbacks++;
    recordDecision({
      type: 'gateway-fallback',
      complexity: classifyComplexity(prompt, opts),
      prompt: prompt.slice(0, 100),
      provider: 'gateway',
      reason: 'No direct SDK keys available',
    });
    const { sendChat } = await import('./openclaw-gateway');
    return sendChat(agentId, prompt, opts);
  } catch (e: unknown) {
    console.error('[direct-ai] Both direct SDK and gateway failed:', (e as Error).message);
    return null;
  }
}

const _stats = {
  totalCalls: 0,
  cacheHits: 0,
  claudeCalls: 0,
  codexCalls: 0,
  gatewayFallbacks: 0,
  errors: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  estimatedCostSaved: 0,
};

const _history: Array<Record<string, any>> = [];
const MAX_HISTORY = 100;

function recordDecision(entry: Record<string, any>): void {
  entry.timestamp = new Date().toISOString();
  _history.push(entry);
  if (_history.length > MAX_HISTORY) _history.shift();
}

export function getDirectAIStats() {
  return { ..._stats };
}

export function getDirectAIHistory(): Array<Record<string, any>> {
  return [..._history].reverse();
}

export function resetClients(): void {
  _configCache = null;
  _configCacheAt = 0;
  _anthropicClient = null;
  _openaiClient = null;
  _vectorMemory = null;
  _tokenTracker = null;
}
