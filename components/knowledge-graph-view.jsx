'use client';

import { useState, useEffect, useCallback } from 'react';

const NODE_TYPE_COLORS = {
  story: 'bg-blue-600',
  bug: 'bg-red-600',
  module: 'bg-green-600',
  model: 'bg-purple-600',
  run: 'bg-yellow-600',
};

export default function KnowledgeGraphView() {
  const [graph, setGraph] = useState(null);
  const [stats, setStats] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const fetchGraph = useCallback(async () => {
    try {
      const [graphRes, statsRes] = await Promise.all([
        fetch('/api/ruflo/memory?type=graph'),
        fetch('/api/ruflo/memory?type=stats'),
      ]);
      const graphData = await graphRes.json();
      const statsData = await statsRes.json();
      if (graphData.ok) setGraph(graphData.graph);
      if (statsData.ok) setStats(statsData);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  if (!graph) return <div className="p-4 text-zinc-500 text-sm">Loading knowledge graph...</div>;

  const nodeNeighbors = selectedNode
    ? graph.edges.filter(e => e.from === selectedNode || e.to === selectedNode)
    : [];

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">Knowledge Graph</h3>

      {/* Stats */}
      {stats && (
        <div className="flex gap-3 text-xs">
          <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
            Nodes: {stats.graph?.nodeCount || 0}
          </span>
          <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
            Edges: {stats.graph?.edgeCount || 0}
          </span>
          {stats.graph?.nodeTypes && Object.entries(stats.graph.nodeTypes).map(([type, count]) => (
            <span key={type} className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
              {type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Node list */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <h4 className="text-xs font-medium text-zinc-400 mb-2">Nodes ({graph.nodes?.length || 0})</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(graph.nodes || []).slice(0, 50).map(node => (
              <button
                key={node.id}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                className={`w-full text-left flex items-center gap-2 p-1.5 rounded text-xs ${
                  selectedNode === node.id ? 'bg-zinc-700' : 'hover:bg-zinc-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${NODE_TYPE_COLORS[node.type] || 'bg-zinc-500'}`} />
                <span className="text-zinc-300 truncate">{node.id}</span>
                <span className="text-zinc-500 ml-auto">{node.type}</span>
              </button>
            ))}
            {(!graph.nodes || graph.nodes.length === 0) && (
              <div className="text-zinc-500 text-xs p-2">No nodes yet</div>
            )}
          </div>
        </div>

        {/* Selected node detail */}
        <div>
          {selectedNode ? (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-2">
                Connections: {selectedNode}
              </h4>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {nodeNeighbors.map((edge, i) => (
                  <div key={i} className="p-1.5 bg-zinc-800 rounded text-xs">
                    <span className="text-zinc-400">{edge.from}</span>
                    <span className="text-zinc-500 mx-1">--{edge.relation}--&gt;</span>
                    <span className="text-zinc-300">{edge.to}</span>
                  </div>
                ))}
                {nodeNeighbors.length === 0 && (
                  <div className="text-zinc-500 text-xs p-2">No connections</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-zinc-500 text-xs p-2">Select a node to see connections</div>
          )}
        </div>
      </div>
    </div>
  );
}
