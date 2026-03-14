/**
 * Direct AI Provider — Unified Claude + Codex SDK layer
 *
 * Cost-saving best practices:
 *   1. Decision tree: classify prompt complexity → route to cheapest capable model
 *   2. Vector DB cache: check semantic similarity against past responses before calling AI
 *   3. Token tracking: record all usage for cost monitoring
 *   4. Gateway fallback: if no direct SDK keys, fall back to OpenClaw gateway
 *
 * Reads API tokens from OpenClaw config (~/.openclaw/openclaw.json)
 * with fallback to environment variables.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

let _configCache = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 30000;

// ── Token Resolution ────────────────────────────────────────────

function resolveTokens() {
  const now = Date.now();
  if (_configCache && now - _configCacheAt < CONFIG_TTL_MS) return _configCache;

  let openclawConfig = null;
  try {
    openclawConfig = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch {
    // Config file not found — fall back to env vars
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

// ── Lazy SDK Initialization ─────────────────────────────────────

let _anthropicClient = null;
let _openaiClient = null;

function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  const tokens = resolveTokens();
  if (!tokens.anthropicKey) return null;
  const { default: Anthropic } = require('@anthropic-ai/sdk');
  _anthropicClient = new Anthropic({ apiKey: tokens.anthropicKey });
  return _anthropicClient;
}

function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  const tokens = resolveTokens();
  if (!tokens.openaiKey) return null;
  const { default: OpenAI } = require('openai');
  _openaiClient = new OpenAI({ apiKey: tokens.openaiKey });
  return _openaiClient;
}

// ── Cost-Saving Decision Tree ───────────────────────────────────

/**
 * Complexity tiers for model routing (inspired by ruflo's 3-tier model routing):
 *   - simple:  Short prompts, classification, yes/no → cheapest model (Haiku / GPT-4.1-mini)
 *   - medium:  Analysis, pattern matching, summaries → mid-tier (Sonnet / GPT-4.1)
 *   - complex: Multi-step reasoning, novel patterns  → capable model (Opus / GPT-4.1)
 */
const MODEL_TIERS = {
  claude: {
    simple:  'claude-haiku-4-5',
    medium:  'claude-sonnet-4-6',
    complex: 'claude-opus-4-6',
  },
  codex: {
    simple:  'gpt-4.1-mini',
    medium:  'gpt-4.1',
    complex: 'gpt-4.1',
  },
};

/**
 * Classify prompt complexity for cost-optimal model routing.
 * Uses heuristics to avoid an AI call just to classify.
 */
function classifyComplexity(prompt, opts = {}) {
  if (opts.complexity) return opts.complexity; // explicit override

  const len = prompt.length;
  const lines = prompt.split('\n').length;

  // Simple: short prompts, binary classification, single-step
  if (len < 200 && lines <= 5) return 'simple';
  if (/\b(yes|no|true|false|pass|fail)\b.*\bonly\b/i.test(prompt)) return 'simple';
  if (/respond with (only|just)/i.test(prompt)) return 'simple';

  // Complex: multi-step reasoning, code generation, novel analysis
  if (len > 2000) return 'complex';
  if (lines > 30) return 'complex';
  if (/\b(analyze|explain|design|architect|refactor|debug)\b/i.test(prompt) && len > 500) return 'complex';

  return 'medium';
}

/**
 * Select the cost-optimal model based on prompt complexity.
 */
function selectModel(provider, prompt, opts = {}) {
  if (opts.model) return opts.model; // explicit model override

  const complexity = classifyComplexity(prompt, opts);
  const tier = MODEL_TIERS[provider] || MODEL_TIERS.claude;
  const model = tier[complexity];

  return model;
}

// ── Vector DB Semantic Cache ────────────────────────────────────

let _vectorMemory = null;

function getVectorMemory() {
  if (_vectorMemory !== undefined && _vectorMemory !== null) return _vectorMemory;
  try {
    // Lazy require — may not be initialized yet at import time
    _vectorMemory = require('./vector-memory.js').default;
    return _vectorMemory;
  } catch {
    _vectorMemory = null;
    return null;
  }
}

/**
 * Check vector DB for semantically similar past AI responses.
 * Returns cached response if similarity exceeds threshold (saves API call).
 */
async function checkSemanticCache(prompt, threshold = 0.85) {
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
    // Vector DB not available or search failed — continue to API call
  }
  return null;
}

/**
 * Store an AI response in the vector DB for future cache hits.
 */
async function cacheResponse(prompt, result) {
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
    // Non-critical — don't let cache failures affect the main flow
  }
}

// ── Token Tracking Integration ──────────────────────────────────

let _tokenTracker = null;

function getTokenTracker() {
  if (_tokenTracker !== undefined && _tokenTracker !== null) return _tokenTracker;
  try {
    _tokenTracker = require('./token-tracker.js').default;
    return _tokenTracker;
  } catch {
    _tokenTracker = null;
    return null;
  }
}

function trackUsage(result, opts = {}) {
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

// ── Provider Check ──────────────────────────────────────────────

export function getAvailableProviders() {
  const tokens = resolveTokens();
  return {
    claude: !!tokens.anthropicKey,
    codex: !!tokens.openaiKey,
    defaultClaudeModel: tokens.defaultClaudeModel,
    defaultCodexModel: tokens.defaultCodexModel,
  };
}

// ── Claude Direct Call ──────────────────────────────────────────

/**
 * Send a direct message to Claude via the Anthropic SDK.
 * Automatically selects cost-optimal model tier.
 */
export async function askClaude(prompt, opts = {}) {
  const client = getAnthropicClient();
  if (!client) return null;

  const model = selectModel('claude', prompt, opts);

  try {
    const params = {
      model,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    };
    if (opts.system) params.system = opts.system;

    const response = await client.messages.create(params);
    const text = response.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') || '';

    return {
      text,
      model: response.model,
      provider: 'claude',
      usage: response.usage,
    };
  } catch (e) {
    console.error('[direct-ai] Claude call failed:', e.message);
    return null;
  }
}

// ── Codex/OpenAI Direct Call ────────────────────────────────────

/**
 * Send a direct message to OpenAI/Codex via the OpenAI SDK.
 * Automatically selects cost-optimal model tier.
 */
export async function askCodex(prompt, opts = {}) {
  const client = getOpenAIClient();
  if (!client) return null;

  const model = selectModel('codex', prompt, opts);

  try {
    const messages = [];
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
  } catch (e) {
    console.error('[direct-ai] Codex call failed:', e.message);
    return null;
  }
}

// ── Smart Router ────────────────────────────────────────────────

/**
 * Route a prompt to the best available provider with cost optimization.
 *
 * Pipeline:
 *   1. Check vector DB semantic cache → return if hit (zero cost)
 *   2. Classify complexity → select cheapest capable model tier
 *   3. Route to provider (Claude for reasoning, Codex for code)
 *   4. Cache response in vector DB for future lookups
 *   5. Track token usage
 */
export async function ask(prompt, opts = {}) {
  _stats.totalCalls++;
  const complexity = classifyComplexity(prompt, opts);

  // 1. Check semantic cache first (free)
  if (opts.useCache !== false) {
    const cached = await checkSemanticCache(prompt, opts.cacheThreshold);
    if (cached) {
      _stats.cacheHits++;
      _stats.estimatedCostSaved += 0.002; // rough estimate per cached call
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
  let result = null;
  let routedTo = null;

  // 2. Route based on task type
  if (taskType === 'code' && providers.codex) {
    routedTo = 'codex';
    result = await askCodex(prompt, opts);
  } else if (taskType === 'reasoning' && providers.claude) {
    routedTo = 'claude';
    result = await askClaude(prompt, opts);
  } else {
    // Auto-route: Claude first (reasoning), Codex fallback
    if (providers.claude) {
      routedTo = 'claude';
      result = await askClaude(prompt, opts);
    }
    if (!result && providers.codex) {
      routedTo = 'codex';
      result = await askCodex(prompt, opts);
    }
  }

  // 3. Track stats
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

// ── Gateway Fallback Wrapper ────────────────────────────────────

/**
 * Try direct SDK first, fall back to OpenClaw gateway.
 * Drop-in replacement for gatewaySendChat in orchestrator-engine.js.
 *
 * Returns response in OpenAI-compatible format:
 * { choices: [{ message: { content: "..." } }] }
 */
export async function askWithGatewayFallback(agentId, prompt, opts = {}) {
  // Try direct SDK first (with semantic cache + cost optimization)
  const result = await ask(prompt, opts);
  if (result) {
    return {
      choices: [{ message: { content: result.text } }],
      _provider: result.provider,
      _model: result.model,
      _usage: result.usage,
    };
  }

  // Fall back to gateway
  try {
    _stats.gatewayFallbacks++;
    recordDecision({
      type: 'gateway-fallback',
      complexity: classifyComplexity(prompt, opts),
      prompt: prompt.slice(0, 100),
      provider: 'gateway',
      reason: 'No direct SDK keys available',
    });
    const { sendChat } = await import('./openclaw-gateway.js');
    return sendChat(agentId, prompt, opts);
  } catch (e) {
    console.error('[direct-ai] Both direct SDK and gateway failed:', e.message);
    return null;
  }
}

// ── Stats & History (for UI monitoring) ─────────────────────────

const _stats = {
  totalCalls: 0,
  cacheHits: 0,
  claudeCalls: 0,
  codexCalls: 0,
  gatewayFallbacks: 0,
  errors: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  estimatedCostSaved: 0, // from cache hits
};

const _history = []; // ring buffer of recent decisions
const MAX_HISTORY = 100;

function recordDecision(entry) {
  entry.timestamp = new Date().toISOString();
  _history.push(entry);
  if (_history.length > MAX_HISTORY) _history.shift();
}

export function getDirectAIStats() {
  return { ..._stats };
}

export function getDirectAIHistory() {
  return [..._history].reverse(); // newest first
}

/** Invalidate cached config and clients (useful when config changes). */
export function resetClients() {
  _configCache = null;
  _configCacheAt = 0;
  _anthropicClient = null;
  _openaiClient = null;
  _vectorMemory = null;
  _tokenTracker = null;
}
