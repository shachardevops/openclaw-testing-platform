/**
 * Swarm Tracker — unified view of all agents, sessions, decisions, and AI routing.
 *
 * Aggregates data from:
 *   - Session Manager registry → active sessions with task mapping
 *   - Orchestrator Engine → decision log, escalation state, pending actions
 *   - Direct AI → routing decisions, model selections, cost tracking
 *   - Results → task status, pass/fail, findings
 *   - Bridge logs → agent output history (latest entries per agent)
 *
 * Provides a single getSwarmState() call for the UI to render the full swarm.
 */

import fs from 'fs';
import path from 'path';
import sessionManager from './session-manager';
import orchestratorEngine from './orchestrator-engine';
import { getDirectAIStats, getDirectAIHistory } from './direct-ai';
import { resultsDir, bridgeLogPath } from './config';
import { getProjectConfig } from './project-loader';
import learningLoop from './learning-loop';
import consensusValidator from './consensus-validator';
import driftDetector from './drift-detector';

// ── Interfaces ──────────────────────────────────────────────────

export interface BridgeLogEntry {
  timestamp?: string;
  content: string;
  type: string;
  model?: string;
}

export interface AgentNode {
  // Identity
  sessionId: string | null;
  taskId: string | null;
  sessionKey: string | null;
  model: string | null;
  isController: boolean;

  // Health
  status: string;
  ageMs: number;
  escalationLevel: number;
  nudgeCount: number;
  swapCount: number;
  nextAction: string | null;
  nextThresholdMs: number | null;
  progress: number;
  recoveryAttempts?: number;
  maxRecoveryAttempts?: number;

  // Task result
  taskStatus: string | null;
  passed: number;
  failed: number;
  warnings: number;
  findingsCount: number;

  // Thinking history (from bridge log)
  thinkingHistory: BridgeLogEntry[];

  // AI routing decisions for this agent
  aiDecisions: Record<string, unknown>[];
}

export interface TimelineEntry {
  timestamp: number;
  source: string;
  event: string;
  agentId: string | null;
  details: string;
  sourceType: string;
}

interface TopologyController {
  sessionId: string;
  key: string;
  model: string;
}

interface Topology {
  controller: TopologyController | null;
  workers: string[];
  orphans: string[];
  stale: string[];
  stuck: string[];
}

interface SwarmStats {
  totalAgents: number;
  healthy: number;
  stale: number;
  stuck: number;
  orphaned: number;
  duplicates: number;
  aiCalls: number;
  aiCacheHits: number;
  aiTokensUsed: number;
  aiCostSaved: number;
  learnedPatterns: number;
  confirmedPatterns: number;
  [key: string]: unknown;
}

interface EngineState {
  started: boolean;
  paused: boolean;
  autonomy: { level: number; name: string; permissions: Record<string, unknown> };
  rateLimit: unknown;
  memorySize: number;
}

interface SubsystemHealth {
  drift: { active: boolean; recentEvents: number };
  consensus: { voters: number; recentDecisions: number };
  learning: { enabled: boolean; patterns: number };
  aiRouter: { claude: boolean; codex: boolean; cacheHitRate: number };
}

export interface SwarmState {
  agents: AgentNode[];
  topology: Topology;
  timeline: TimelineEntry[];
  stats: SwarmStats;
  engine: EngineState;
  pendingReview: unknown[];
  pendingConfirmations: unknown[];
  subsystems: SubsystemHealth;
  thresholds: Record<string, unknown>;
}

interface AgentDetail extends AgentNode {
  timeline: TimelineEntry[];
}

interface BridgeLogCache {
  mtime: number;
  entries: Record<string, unknown>[];
  byAgent: Map<string, BridgeLogEntry[]>;
}

// ── Bridge Log Parser ───────────────────────────────────────────

const BRIDGE_LOG_CACHE: BridgeLogCache = { mtime: 0, entries: [], byAgent: new Map() };
const MAX_THINKING_ENTRIES = 30; // per agent

/**
 * Parse bridge log (JSONL) and group entries by session/task for agent thinking history.
 * Uses mtime check to avoid re-parsing unchanged files.
 */
function parseBridgeLog(): BridgeLogCache {
  const logPath = bridgeLogPath();
  try {
    const stat = fs.statSync(logPath);
    if (stat.mtimeMs === BRIDGE_LOG_CACHE.mtime) return BRIDGE_LOG_CACHE;

    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries: Record<string, unknown>[] = [];
    const byAgent = new Map<string, BridgeLogEntry[]>();

    // Parse last 500 lines max for performance
    const startIdx = Math.max(0, lines.length - 500);
    for (let i = startIdx; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]) as Record<string, unknown>;
        entries.push(entry);

        // Group by agent/task ID
        const agentKey = (entry.taskId || entry.sessionId || entry.agentId || 'unknown') as string;
        if (!byAgent.has(agentKey)) byAgent.set(agentKey, []);
        const agentEntries = byAgent.get(agentKey)!;
        agentEntries.push({
          timestamp: (entry.timestamp || entry.ts || entry.time) as string | undefined,
          content: (entry.message || entry.content || entry.text || entry.output || JSON.stringify(entry)) as string,
          type: (entry.type || entry.level || 'output') as string,
          model: entry.model as string | undefined,
        });
        if (agentEntries.length > MAX_THINKING_ENTRIES) agentEntries.shift();
      } catch {
        // Skip non-JSON lines
      }
    }

    BRIDGE_LOG_CACHE.mtime = stat.mtimeMs;
    BRIDGE_LOG_CACHE.entries = entries;
    BRIDGE_LOG_CACHE.byAgent = byAgent;
    return BRIDGE_LOG_CACHE;
  } catch {
    return BRIDGE_LOG_CACHE;
  }
}

// ── Results Loader ──────────────────────────────────────────────

function loadResults(): Record<string, Record<string, unknown>> {
  const dir = resultsDir();
  const results: Record<string, Record<string, unknown>> = {};
  try {
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json') && f !== 'system.json');
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
        const taskId = file.replace('.json', '');
        results[taskId] = data;
      } catch { /* skip corrupt files */ }
    }
  } catch { /* results dir may not exist yet */ }
  return results;
}

// ── Swarm State Builder ─────────────────────────────────────────

/**
 * Build a unified swarm state combining all data sources.
 */
export function getSwarmState(): SwarmState {
  const orchStatus = orchestratorEngine.getStatus();
  const smState = sessionManager.getState();
  const aiStats = getDirectAIStats();
  const aiHistory = getDirectAIHistory();
  const results = loadResults();
  const bridgeLog = parseBridgeLog();
  const driftStatus = driftDetector.getStatus();
  const consensusStatus = consensusValidator.getStatus();
  const learningStatus = learningLoop.getStatus();

  // Build agent nodes from orchestrator decision tree + session manager registry
  const agents: AgentNode[] = [];
  const decisionTreeNodes = orchStatus.decisionTree?.nodes || [];

  for (const node of decisionTreeNodes) {
    const taskResult = node.taskId ? results[node.taskId] : null;
    const thinkingHistory: BridgeLogEntry[] = bridgeLog.byAgent.get(node.taskId) ||
                            bridgeLog.byAgent.get(node.sessionId) || [];

    // Collect AI routing decisions for this agent
    const agentAIDecisions = aiHistory.filter((d: Record<string, unknown>) =>
      d.prompt && node.taskId && (d.prompt as string).includes(node.taskId)
    ).slice(0, 10);

    agents.push({
      // Identity
      sessionId: node.sessionId,
      taskId: node.taskId,
      sessionKey: node.key,
      model: node.model,
      isController: false,

      // Health
      status: node.status,
      ageMs: node.ageMs,
      escalationLevel: node.level,
      nudgeCount: node.nudgeCount,
      swapCount: node.swapCount,
      nextAction: node.nextAction,
      nextThresholdMs: node.nextThresholdMs,
      progress: node.progress,
      recoveryAttempts: node.recoveryAttempts,
      maxRecoveryAttempts: node.maxRecoveryAttempts,

      // Task result
      taskStatus: (taskResult?.status as string) || null,
      passed: (taskResult?.passed as number) || 0,
      failed: (taskResult?.failed as number) || 0,
      warnings: (taskResult?.warnings as number) || 0,
      findingsCount: (taskResult?.findings as unknown[])?.length || 0,

      // Thinking history (from bridge log)
      thinkingHistory,

      // AI routing decisions for this agent
      aiDecisions: agentAIDecisions,
    });
  }

  // Add controller session if found
  const controllerSession = smState.sessions?.find((s: Record<string, unknown>) => s.isController);
  if (controllerSession) {
    agents.unshift({
      sessionId: controllerSession.sessionId,
      taskId: null,
      sessionKey: controllerSession.key,
      model: controllerSession.model,
      isController: true,
      status: controllerSession.status || 'healthy',
      ageMs: controllerSession.ageMs || 0,
      escalationLevel: 0,
      nudgeCount: 0,
      swapCount: 0,
      nextAction: 'controller',
      nextThresholdMs: null,
      progress: 0,
      taskStatus: null,
      passed: 0, failed: 0, warnings: 0, findingsCount: 0,
      thinkingHistory: [],
      aiDecisions: [],
    });
  }

  // Build topology
  const topology: Topology = {
    controller: controllerSession ? {
      sessionId: controllerSession.sessionId,
      key: controllerSession.key,
      model: controllerSession.model,
    } : null,
    workers: agents.filter(a => !a.isController && a.status !== 'orphaned').map(a => (a.sessionId || a.taskId)!),
    orphans: agents.filter(a => a.status === 'orphaned').map(a => a.sessionId!),
    stale: agents.filter(a => a.status === 'stale').map(a => (a.sessionId || a.taskId)!),
    stuck: agents.filter(a => a.status === 'stuck').map(a => a.taskId!),
  };

  // Build unified timeline from orchestrator decisions + AI routing + session manager actions
  const timeline: TimelineEntry[] = [];

  // Orchestrator decisions
  for (const d of orchStatus.recentDecisions.slice(0, 30)) {
    timeline.push({
      timestamp: d.ts,
      source: 'orchestrator',
      event: d.action,
      agentId: d.target,
      details: d.reason,
      sourceType: d.source,
    });
  }

  // Direct AI routing decisions
  for (const d of aiHistory.slice(0, 20)) {
    timeline.push({
      timestamp: new Date(d.timestamp).getTime(),
      source: 'ai-router',
      event: d.type,
      agentId: null,
      details: `${d.provider}/${d.model || '?'} [${d.complexity}] ${d.prompt || ''}`,
      sourceType: d.provider,
    });
  }

  // Session manager actions
  for (const a of (smState.actionLog || []).slice(0, 20)) {
    timeline.push({
      timestamp: a.ts,
      source: 'session-mgr',
      event: a.action,
      agentId: a.sessionId || a.target,
      details: a.result || a.reason,
      sourceType: 'session-manager',
    });
  }

  // Sort timeline newest first
  timeline.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Aggregate stats
  const stats: SwarmStats = {
    totalAgents: agents.length,
    healthy: agents.filter(a => a.status === 'healthy').length,
    stale: agents.filter(a => a.status === 'stale').length,
    stuck: agents.filter(a => a.status === 'stuck').length,
    orphaned: agents.filter(a => a.status === 'orphaned').length,
    duplicates: agents.filter(a => a.status === 'duplicate').length,
    // Orchestrator stats
    ...orchStatus.stats,
    // AI routing stats
    aiCalls: aiStats.totalCalls,
    aiCacheHits: aiStats.cacheHits,
    aiTokensUsed: aiStats.totalInputTokens + aiStats.totalOutputTokens,
    aiCostSaved: aiStats.estimatedCostSaved,
    // Learning
    learnedPatterns: learningStatus.patterns?.total || 0,
    confirmedPatterns: learningStatus.patterns?.confirmed || 0,
  };

  return {
    agents,
    topology,
    timeline: timeline.slice(0, 50),
    stats,
    // Engine state
    engine: {
      started: orchStatus.started,
      paused: orchStatus.paused,
      autonomy: orchStatus.autonomy,
      rateLimit: orchStatus.rateLimit,
      memorySize: orchStatus.memorySize,
    },
    // Pending actions
    pendingReview: orchStatus.pendingReview,
    pendingConfirmations: orchStatus.pendingConfirmations,
    // Subsystem health
    subsystems: {
      drift: { active: driftStatus.enabled || false, recentEvents: driftStatus.recentDriftEvents?.length || 0 },
      consensus: { voters: consensusStatus.registeredVoters?.length || 0, recentDecisions: consensusStatus.recentDecisions?.length || 0 },
      learning: { enabled: learningStatus.enabled, patterns: learningStatus.patterns?.total || 0 },
      aiRouter: { claude: aiStats.claudeCalls > 0 || false, codex: aiStats.codexCalls > 0 || false, cacheHitRate: aiStats.totalCalls > 0 ? Math.round((aiStats.cacheHits / aiStats.totalCalls) * 100) : 0 },
    },
    // Thresholds for UI display
    thresholds: orchStatus.decisionTree?.thresholds || {},
  };
}

/**
 * Get detailed state for a single agent (expanded view).
 */
export function getAgentDetail(agentId: string): AgentDetail | null {
  const swarm = getSwarmState();
  const agent = swarm.agents.find(a =>
    a.sessionId === agentId || a.taskId === agentId || a.sessionKey === agentId
  );
  if (!agent) return null;

  // Get richer thinking history
  const bridgeLog = parseBridgeLog();
  const thinkingHistory: BridgeLogEntry[] = bridgeLog.byAgent.get(agent.taskId!) ||
                          bridgeLog.byAgent.get(agent.sessionId!) || [];

  // Get all timeline entries for this agent
  const agentTimeline = swarm.timeline.filter(t =>
    t.agentId === agent.sessionId || t.agentId === agent.taskId
  );

  return {
    ...agent,
    thinkingHistory,
    timeline: agentTimeline,
  };
}
