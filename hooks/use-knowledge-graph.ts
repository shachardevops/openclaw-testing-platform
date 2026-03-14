'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { buildGraph } from '@/lib/graph-transforms';

interface KnowledgeGraphFilters {
  showPatterns: boolean;
  showModels: boolean;
  showDecisions: boolean;
  showMemory: boolean;
  showEvents: boolean;
}

interface RawGraphData {
  patterns?: Record<string, unknown>;
  modelStats?: Record<string, unknown>;
  decisionLog?: unknown[];
  memoryStatus?: Record<string, unknown>;
  events?: unknown[];
  tokenStatus?: Record<string, unknown>;
}

interface GraphNode {
  id: string;
  [key: string]: unknown;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

/**
 * Hook that fetches knowledge data from multiple APIs and builds a React Flow graph.
 * Polls every 30s (graph data changes slowly).
 */
export function useKnowledgeGraph(enabled = true, interval = 30000) {
  const [raw, setRaw] = useState<RawGraphData>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<KnowledgeGraphFilters>({
    showPatterns: true,
    showModels: true,
    showDecisions: true,
    showMemory: true,
    showEvents: true,
  });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!enabled) return;

    const endpoints = [
      { key: 'learningLoop', url: '/api/learning-loop' },
      { key: 'orchestrator', url: '/api/orchestrator' },
      { key: 'memoryTiers', url: '/api/memory-tiers' },
      { key: 'tokenTracker', url: '/api/token-tracker' },
      { key: 'auditTrail', url: '/api/audit-trail' },
    ];

    try {
      const responses = await Promise.allSettled(
        endpoints.map(async ({ key, url }) => {
          const res = await fetch(url);
          const json = await res.json();
          return { key, data: json };
        })
      );

      if (!mountedRef.current) return;

      const merged: Record<string, Record<string, unknown>> = {};
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value.data) {
          merged[r.value.key] = r.value.data;
        }
      }

      // Extract the specific data structures the graph transforms expect
      const ll = merged.learningLoop || {};
      const orch = merged.orchestrator || {};
      const mem = merged.memoryTiers || {};
      const tok = merged.tokenTracker || {};
      const audit = merged.auditTrail || {};

      setRaw({
        patterns: (ll.patterns || (ll.status as Record<string, unknown>)?.patterns || {}) as Record<string, unknown>,
        modelStats: (ll.modelStats || ((ll.status as Record<string, unknown>)?.modelStats as Record<string, unknown>)?.models || {}) as Record<string, unknown>,
        decisionLog: (orch.decisionLog || orch.log || []) as unknown[],
        memoryStatus: (mem.status || mem) as Record<string, unknown>,
        events: (audit.events || audit.recent || []) as unknown[],
        tokenStatus: (tok.status || tok) as Record<string, unknown>,
      });
    } catch (e: unknown) { /* keep previous state */ }

    if (mountedRef.current) setLoading(false);
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      fetchAll();
      const id = setInterval(fetchAll, interval);
      return () => { mountedRef.current = false; clearInterval(id); };
    }
    return () => { mountedRef.current = false; };
  }, [enabled, interval, fetchAll]);

  // Build graph from raw data + filters
  const graph = useMemo(
    () => buildGraph(raw, filters) as any,
    [raw, filters]
  );

  const toggleFilter = useCallback((key: keyof KnowledgeGraphFilters) => {
    setFilters(f => ({ ...f, [key]: !f[key] }));
  }, []);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: GraphNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    loading,
    filters,
    toggleFilter,
    selectedNode,
    onNodeClick,
    setSelectedNode,
    refresh: fetchAll,
    raw,
  };
}
