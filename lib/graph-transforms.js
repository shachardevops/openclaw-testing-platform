/**
 * Pure client-side transforms: API responses → React Flow nodes + edges.
 * No server-side dependencies — safe for 'use client' components.
 */

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  bug: { P1: '#ef4444', P2: '#f97316', P3: '#eab308', WARNING: '#a3a3a3' },
  outcome: { passed: '#22c55e', failed: '#ef4444' },
  model: '#a855f7',
  decision: '#3b82f6',
  memory: { working: '#f59e0b', episodic: '#06b6d4', semantic: '#eab308' },
  event: '#64748b',
};

// ─── Node Factories ──────────────────────────────────────────────────────────

export function patternsToNodes(patterns = {}) {
  const nodes = [];
  for (const [id, p] of Object.entries(patterns)) {
    if (!p) continue;
    const isBug = p.type === 'bug';
    const isOutcome = p.type === 'outcome' || id.startsWith('outcome:');
    const isRecurring = id.startsWith('recurring-fail:');
    const isOrch = id.startsWith('orch:');

    let color = COLORS.event;
    let nodeType = 'pattern';
    if (isBug) {
      color = COLORS.bug[p.category] || COLORS.bug.WARNING;
      nodeType = 'bug';
    } else if (isOutcome) {
      color = p.context?.status === 'passed' ? COLORS.outcome.passed : COLORS.outcome.failed;
      nodeType = 'outcome';
    } else if (isRecurring) {
      color = COLORS.outcome.failed;
      nodeType = 'recurring';
    } else if (isOrch) {
      color = COLORS.decision;
      nodeType = 'decision';
    }

    nodes.push({
      id: `pattern:${id}`,
      type: 'knowledgeNode',
      data: {
        label: p.title || id,
        nodeType,
        color,
        count: p.count || 1,
        category: p.category,
        status: p.status,
        taskId: p.taskId,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        raw: p,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

export function modelsToNodes(modelStats = {}) {
  const nodes = [];
  for (const [modelId, stats] of Object.entries(modelStats)) {
    if (!stats) continue;
    nodes.push({
      id: `model:${modelId}`,
      type: 'knowledgeNode',
      data: {
        label: modelId,
        nodeType: 'model',
        color: COLORS.model,
        passRate: stats.passRate ?? (stats.runs > 0 ? (stats.passed / stats.runs) * 100 : 0),
        runs: stats.runs || 0,
        passed: stats.passed || 0,
        failed: stats.failed || 0,
        avgDuration: stats.avgDurationMs,
        findings: stats.findings,
        lastUsed: stats.lastUsed,
        raw: stats,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

export function decisionsToNodes(decisionLog = []) {
  const nodes = [];
  // Group by action type to avoid flooding the graph
  const grouped = {};
  for (const d of decisionLog) {
    const key = `${d.type || 'unknown'}:${d.action || 'none'}`;
    if (!grouped[key]) {
      grouped[key] = { ...d, count: 0, targets: [] };
    }
    grouped[key].count++;
    if (d.target && grouped[key].targets.length < 5) {
      grouped[key].targets.push(d.target);
    }
  }

  for (const [key, d] of Object.entries(grouped)) {
    nodes.push({
      id: `decision:${key}`,
      type: 'knowledgeNode',
      data: {
        label: `${d.type}: ${d.action}`,
        nodeType: 'decision',
        color: COLORS.decision,
        count: d.count,
        targets: d.targets,
        confidence: d.confidence,
        aiConsulted: d.aiConsulted,
        raw: d,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

export function memoryToNodes(memoryStatus = {}) {
  const nodes = [];
  const tiers = [
    { key: 'working', color: COLORS.memory.working },
    { key: 'episodic', color: COLORS.memory.episodic },
    { key: 'semantic', color: COLORS.memory.semantic },
  ];

  for (const { key, color } of tiers) {
    const count = memoryStatus[key] ?? memoryStatus[`${key}Count`] ?? 0;
    if (count === 0 && typeof count === 'number') continue;

    nodes.push({
      id: `memory:${key}`,
      type: 'knowledgeNode',
      data: {
        label: `${key} memory`,
        nodeType: 'memory',
        color,
        tier: key,
        count: typeof count === 'number' ? count : Object.keys(count).length,
        raw: memoryStatus,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

export function eventsToNodes(events = [], limit = 20) {
  const nodes = [];
  // Take most recent significant events
  const recent = events.slice(-limit);
  const categoryGroups = {};

  for (const ev of recent) {
    const cat = ev.category || 'system';
    if (!categoryGroups[cat]) {
      categoryGroups[cat] = { count: 0, actions: new Set(), latest: ev };
    }
    categoryGroups[cat].count++;
    if (ev.action) categoryGroups[cat].actions.add(ev.action);
    categoryGroups[cat].latest = ev;
  }

  for (const [cat, group] of Object.entries(categoryGroups)) {
    nodes.push({
      id: `event:${cat}`,
      type: 'knowledgeNode',
      data: {
        label: `${cat} events`,
        nodeType: 'event',
        color: COLORS.event,
        count: group.count,
        actions: [...group.actions],
        latest: group.latest,
        raw: group,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

export function tokenToNodes(tokenStatus = {}) {
  const nodes = [];
  const modelUsage = tokenStatus.modelUsage || tokenStatus.models || {};

  for (const [modelId, usage] of Object.entries(modelUsage)) {
    // Don't duplicate if we already have a model node — handled by dedup
    nodes.push({
      id: `token:${modelId}`,
      type: 'knowledgeNode',
      data: {
        label: `${modelId} (tokens)`,
        nodeType: 'token',
        color: '#10b981',
        totalTokens: usage.totalTokens || 0,
        totalCost: usage.totalCost || 0,
        taskCount: usage.taskCount || 0,
        raw: usage,
      },
      position: { x: 0, y: 0 },
    });
  }
  return nodes;
}

// ─── Edge Builder ────────────────────────────────────────────────────────────

export function buildEdges(nodes) {
  const edges = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  let edgeIdx = 0;

  // Connect patterns to their task's outcome nodes
  for (const node of nodes) {
    const d = node.data;
    if (d.nodeType === 'bug' && d.taskId) {
      // Find matching outcome node
      const outcomeId = `pattern:outcome:${d.taskId}:failed`;
      const altOutcomeId = `pattern:outcome:${d.taskId}:passed`;
      const target = nodeMap.has(outcomeId) ? outcomeId : nodeMap.has(altOutcomeId) ? altOutcomeId : null;
      if (target) {
        edges.push({
          id: `e-${edgeIdx++}`,
          source: target,
          target: node.id,
          label: 'found',
          style: { stroke: d.color },
          animated: false,
        });
      }
    }

    // Connect models to outcome nodes
    if (d.nodeType === 'outcome' && d.raw?.context?.model) {
      const modelId = `model:${d.raw.context.model}`;
      if (nodeMap.has(modelId)) {
        edges.push({
          id: `e-${edgeIdx++}`,
          source: modelId,
          target: node.id,
          label: 'ran',
          style: { stroke: '#a855f780', strokeDasharray: '4 2' },
        });
      }
    }

    // Connect decisions to related patterns
    if (d.nodeType === 'decision' && d.targets) {
      for (const t of d.targets) {
        // Try to find a matching pattern node by taskId
        const match = nodes.find(n =>
          n.data.taskId === t || n.id.includes(t)
        );
        if (match) {
          edges.push({
            id: `e-${edgeIdx++}`,
            source: node.id,
            target: match.id,
            label: 'acted on',
            style: { stroke: '#3b82f680' },
            animated: true,
          });
        }
      }
    }

    // Connect token nodes to model nodes
    if (d.nodeType === 'token') {
      const modelName = node.id.replace('token:', '');
      const modelId = `model:${modelName}`;
      if (nodeMap.has(modelId)) {
        edges.push({
          id: `e-${edgeIdx++}`,
          source: modelId,
          target: node.id,
          label: 'usage',
          style: { stroke: '#10b98180', strokeDasharray: '2 2' },
        });
      }
    }
  }

  // Connect memory tiers
  const workingId = 'memory:working';
  const episodicId = 'memory:episodic';
  const semanticId = 'memory:semantic';
  if (nodeMap.has(workingId) && nodeMap.has(episodicId)) {
    edges.push({
      id: `e-${edgeIdx++}`,
      source: workingId,
      target: episodicId,
      label: 'promotes',
      style: { stroke: '#f59e0b80' },
      animated: true,
    });
  }
  if (nodeMap.has(episodicId) && nodeMap.has(semanticId)) {
    edges.push({
      id: `e-${edgeIdx++}`,
      source: episodicId,
      target: semanticId,
      label: 'consolidates',
      style: { stroke: '#06b6d480' },
      animated: true,
    });
  }

  return edges;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const TYPE_COLUMNS = {
  model: 0,
  token: 0,
  outcome: 1,
  bug: 2,
  recurring: 2,
  pattern: 2,
  decision: 3,
  memory: 4,
  event: 5,
};

/**
 * Simple grid layout: nodes grouped by type into columns.
 * Returns new nodes array with computed positions.
 */
export function layoutNodes(nodes) {
  const columns = {};
  for (const node of nodes) {
    const col = TYPE_COLUMNS[node.data.nodeType] ?? 5;
    if (!columns[col]) columns[col] = [];
    columns[col].push(node);
  }

  const COL_WIDTH = 280;
  const ROW_HEIGHT = 100;

  return nodes.map(node => {
    const col = TYPE_COLUMNS[node.data.nodeType] ?? 5;
    const colNodes = columns[col] || [];
    const idx = colNodes.indexOf(node);
    return {
      ...node,
      position: {
        x: col * COL_WIDTH + 50,
        y: idx * ROW_HEIGHT + 50,
      },
    };
  });
}

// ─── Main Transform ──────────────────────────────────────────────────────────

/**
 * Build the full graph from all API data sources.
 * @param {Object} data - { patterns, modelStats, decisionLog, memoryStatus, events, tokenStatus }
 * @param {Object} filters - { showPatterns, showModels, showDecisions, showMemory, showEvents }
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildGraph(data = {}, filters = {}) {
  const {
    showPatterns = true,
    showModels = true,
    showDecisions = true,
    showMemory = true,
    showEvents = true,
  } = filters;

  let allNodes = [];

  if (showPatterns) {
    allNodes.push(...patternsToNodes(data.patterns));
  }
  if (showModels) {
    allNodes.push(...modelsToNodes(data.modelStats));
    allNodes.push(...tokenToNodes(data.tokenStatus));
  }
  if (showDecisions) {
    allNodes.push(...decisionsToNodes(data.decisionLog));
  }
  if (showMemory) {
    allNodes.push(...memoryToNodes(data.memoryStatus));
  }
  if (showEvents) {
    allNodes.push(...eventsToNodes(data.events));
  }

  // Deduplicate by id (prefer first occurrence)
  const seen = new Set();
  allNodes = allNodes.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  const edges = buildEdges(allNodes);
  const positioned = layoutNodes(allNodes);

  return { nodes: positioned, edges };
}
