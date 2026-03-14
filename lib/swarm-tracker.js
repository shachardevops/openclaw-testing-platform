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
import sessionManager from './session-manager.js';
import orchestratorEngine from './orchestrator-engine.js';
import { getDirectAIStats, getDirectAIHistory } from './direct-ai.js';
import { resultsDir, bridgeLogPath } from './config.js';
import { getProjectConfig } from './project-loader.js';
import learningLoop from './learning-loop.js';
import consensusValidator from './consensus-validator.js';
import driftDetector from './drift-detector.js';

// ── Bridge Log Parser ───────────────────────────────────────────

const BRIDGE_LOG_CACHE = { mtime: 0, entries: [], byAgent: new Map() };
const MAX_THINKING_ENTRIES = 30; // per agent

/**
 * Parse bridge log (JSONL) and group entries by session/task for agent thinking history.
 * Uses mtime check to avoid re-parsing unchanged files.
 */
function parseBridgeLog() {
  const logPath = bridgeLogPath();
  try {
    const stat = fs.statSync(logPath);
    if (stat.mtimeMs === BRIDGE_LOG_CACHE.mtime) return BRIDGE_LOG_CACHE;

    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries = [];
    const byAgent = new Map();

    // Parse last 500 lines max for performance
    const startIdx = Math.max(0, lines.length - 500);
    for (let i = startIdx; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        entries.push(entry);

        // Group by agent/task ID
        const agentKey = entry.taskId || entry.sessionId || entry.agentId || 'unknown';
        if (!byAgent.has(agentKey)) byAgent.set(agentKey, []);
        const agentEntries = byAgent.get(agentKey);
        agentEntries.push({
          timestamp: entry.timestamp || entry.ts || entry.time,
          content: entry.message || entry.content || entry.text || entry.output || JSON.stringify(entry),
          type: entry.type || entry.level || 'output',
          model: entry.model,
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

function loadResults() {
  const dir = resultsDir();
  const results = {};
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'system.json');
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
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
export function getSwarmState() {
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
  const agents = [];
  const decisionTreeNodes = orchStatus.decisionTree?.nodes || [];

  for (const node of decisionTreeNodes) {
    const taskResult = node.taskId ? results[node.taskId] : null;
    const thinkingHistory = bridgeLog.byAgent.get(node.taskId) ||
                            bridgeLog.byAgent.get(node.sessionId) || [];

    // Collect AI routing decisions for this agent
    const agentAIDecisions = aiHistory.filter(d =>
      d.prompt && node.taskId && d.prompt.includes(node.taskId)
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
      taskStatus: taskResult?.status || null,
      passed: taskResult?.passed || 0,
      failed: taskResult?.failed || 0,
      warnings: taskResult?.warnings || 0,
      findingsCount: taskResult?.findings?.length || 0,

      // Thinking history (from bridge log)
      thinkingHistory,

      // AI routing decisions for this agent
      aiDecisions: agentAIDecisions,
    });
  }

  // Add controller session if found
  const controllerSession = smState.sessions?.find(s => s.isController);
  if (controllerSession) {
    agents.unshift({
      sessionId: controllerSession.sessionId,
      taskId: null,
      sessionKey: controllerSession.key,
      model: controllerSession.model,
      isController: true,
      status: controllerSession.status || 'healthy',
      ageMs: controllerSession.ageMs || (controllerSession.ageMinutes ? controllerSession.ageMinutes * 60000 : 0),
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
  const topology = {
    controller: controllerSession ? {
      sessionId: controllerSession.sessionId,
      key: controllerSession.key,
      model: controllerSession.model,
    } : null,
    workers: agents.filter(a => !a.isController && a.status !== 'orphaned').map(a => a.sessionId || a.taskId),
    orphans: agents.filter(a => a.status === 'orphaned').map(a => a.sessionId),
    stale: agents.filter(a => a.status === 'stale').map(a => a.sessionId || a.taskId),
    stuck: agents.filter(a => a.status === 'stuck').map(a => a.taskId),
  };

  // Build unified timeline from orchestrator decisions + AI routing + session manager actions
  const timeline = [];

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
  const stats = {
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
      drift: { active: driftStatus.active || false, recentEvents: driftStatus.recentDriftEvents?.length || 0 },
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
export function getAgentDetail(agentId) {
  const swarm = getSwarmState();
  const agent = swarm.agents.find(a =>
    a.sessionId === agentId || a.taskId === agentId || a.sessionKey === agentId
  );
  if (!agent) return null;

  // Get richer thinking history
  const bridgeLog = parseBridgeLog();
  const thinkingHistory = bridgeLog.byAgent.get(agent.taskId) ||
                          bridgeLog.byAgent.get(agent.sessionId) || [];

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
