'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import type { Node, Edge, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useKnowledgeGraph } from '@/hooks/use-knowledge-graph';

// ─── Custom Node ─────────────────────────────────────────────────────────────

interface KnowledgeNodeData {
  nodeType: string;
  color: string;
  count?: number;
  passRate?: number;
  label: string;
  category?: string;
  taskId?: string;
  runs?: number;
  passed?: number;
  failed?: number;
  totalTokens?: number;
  totalCost?: number;
  confidence?: number;
  tier?: string;
  actions?: string[];
  targets?: string[];
  firstSeen?: string;
  lastSeen?: string;
  lastUsed?: string;
  findings?: { p1: number; p2: number; p3: number; warnings: number };
  [key: string]: unknown;
}

const SHAPE_CLASSES: Record<string, string> = {
  bug: 'rounded-sm',
  outcome: 'rounded-full',
  model: 'rotate-45',
  decision: 'rounded-none',
  memory: 'rounded-full',
  event: 'rounded-lg',
  recurring: 'rounded-sm',
  pattern: 'rounded-lg',
  token: 'rounded-full',
};

function KnowledgeNode({ data, selected }: NodeProps<Node<KnowledgeNodeData>>) {
  const shape = SHAPE_CLASSES[data.nodeType] || 'rounded-lg';
  const size = data.nodeType === 'model'
    ? Math.max(32, Math.min(56, 32 + (data.passRate || 0) / 5))
    : Math.max(28, Math.min(48, 28 + (data.count || 1) * 3));

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-1.5 !h-1.5" />
      <div
        className={`flex flex-col items-center gap-1 p-1 cursor-pointer transition-all ${
          selected ? 'scale-110' : 'hover:scale-105'
        }`}
      >
        <div
          className={`${shape} border-2 flex items-center justify-center`}
          style={{
            width: size,
            height: size,
            backgroundColor: `${data.color}20`,
            borderColor: data.color,
            ...(data.nodeType === 'model' ? { transform: 'rotate(45deg)' } : {}),
          }}
        >
          <span
            className="text-[9px] font-bold"
            style={{
              color: data.color,
              ...(data.nodeType === 'model' ? { transform: 'rotate(-45deg)' } : {}),
            }}
          >
            {(data.count ?? 0) > 1 ? data.count : ''}
          </span>
        </div>
        <span className="text-[9px] text-zinc-400 max-w-[100px] truncate text-center leading-tight">
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !w-1.5 !h-1.5" />
    </>
  );
}

const nodeTypes = { knowledgeNode: KnowledgeNode };

// ─── Filter Bar ──────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: Record<string, boolean>;
  toggleFilter: (key: string) => void;
  nodeCount: number;
  edgeCount: number;
}

const FILTER_PILLS = [
  { key: 'showPatterns', label: 'Patterns', color: '#ef4444' },
  { key: 'showModels', label: 'Models', color: '#a855f7' },
  { key: 'showDecisions', label: 'Decisions', color: '#3b82f6' },
  { key: 'showMemory', label: 'Memory', color: '#06b6d4' },
  { key: 'showEvents', label: 'Events', color: '#64748b' },
];

function FilterBar({ filters, toggleFilter, nodeCount, edgeCount }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
      {FILTER_PILLS.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => toggleFilter(key)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition ${
            filters[key]
              ? 'bg-zinc-800 text-zinc-200'
              : 'bg-zinc-900 text-zinc-600'
          }`}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: filters[key] ? color : '#3f3f46' }}
          />
          {label}
        </button>
      ))}
      <span className="ml-auto text-[10px] text-zinc-600">
        {nodeCount} nodes &middot; {edgeCount} edges
      </span>
    </div>
  );
}

// ─── Detail Sidebar ──────────────────────────────────────────────────────────

interface DetailSidebarProps {
  node: Node<KnowledgeNodeData> | null;
  onClose: () => void;
}

function DetailSidebar({ node, onClose }: DetailSidebarProps) {
  if (!node) return null;
  const d = node.data;

  return (
    <div className="w-64 shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: d.color }}
          />
          <span className="text-xs font-medium text-zinc-200 capitalize">{d.nodeType}</span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">
          &times;
        </button>
      </div>

      <div className="p-3 space-y-3 text-[11px]">
        <div>
          <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Label</div>
          <div className="text-zinc-200">{d.label}</div>
        </div>

        {(d.count ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Occurrences</div>
            <div className="text-zinc-200">{d.count}</div>
          </div>
        )}

        {d.category && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Category</div>
            <div className="text-zinc-200">{d.category}</div>
          </div>
        )}

        {d.taskId && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Task</div>
            <div className="text-zinc-200 font-mono">{d.taskId}</div>
          </div>
        )}

        {d.passRate !== undefined && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Pass Rate</div>
            <div className="text-zinc-200">{d.passRate.toFixed(1)}%</div>
          </div>
        )}

        {(d.runs ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Runs</div>
            <div className="text-zinc-200">
              {d.passed ?? 0} passed / {d.failed ?? 0} failed ({d.runs} total)
            </div>
          </div>
        )}

        {(d.totalTokens ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Tokens Used</div>
            <div className="text-zinc-200">{d.totalTokens!.toLocaleString()}</div>
          </div>
        )}

        {(d.totalCost ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Est. Cost</div>
            <div className="text-zinc-200">${d.totalCost!.toFixed(4)}</div>
          </div>
        )}

        {d.confidence !== undefined && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Confidence</div>
            <div className="text-zinc-200">{(d.confidence * 100).toFixed(0)}%</div>
          </div>
        )}

        {d.tier && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Memory Tier</div>
            <div className="text-zinc-200 capitalize">{d.tier}</div>
          </div>
        )}

        {(d.actions?.length ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Actions</div>
            <div className="flex flex-wrap gap-1">
              {d.actions!.map(a => (
                <span key={a} className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 text-[9px]">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {(d.targets?.length ?? 0) > 0 && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Targets</div>
            <div className="space-y-0.5">
              {d.targets!.map((t, i) => (
                <div key={i} className="text-zinc-300 font-mono text-[10px] truncate">{t}</div>
              ))}
            </div>
          </div>
        )}

        {(d.firstSeen || d.lastSeen || d.lastUsed) && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Timeline</div>
            {d.firstSeen && <div className="text-zinc-400">First: {new Date(d.firstSeen).toLocaleString()}</div>}
            {d.lastSeen && <div className="text-zinc-400">Last: {new Date(d.lastSeen).toLocaleString()}</div>}
            {d.lastUsed && <div className="text-zinc-400">Used: {new Date(d.lastUsed).toLocaleString()}</div>}
          </div>
        )}

        {d.findings && (
          <div>
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-0.5">Findings</div>
            <div className="flex gap-2 text-[10px]">
              {d.findings.p1 > 0 && <span className="text-red-400">P1: {d.findings.p1}</span>}
              {d.findings.p2 > 0 && <span className="text-orange-400">P2: {d.findings.p2}</span>}
              {d.findings.p3 > 0 && <span className="text-yellow-400">P3: {d.findings.p3}</span>}
              {d.findings.warnings > 0 && <span className="text-zinc-400">Warn: {d.findings.warnings}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function GraphLegend() {
  const items = [
    { label: 'Bug (P1)', color: '#ef4444', shape: 'rounded-sm' },
    { label: 'Bug (P2)', color: '#f97316', shape: 'rounded-sm' },
    { label: 'Outcome', color: '#22c55e', shape: 'rounded-full' },
    { label: 'Model', color: '#a855f7', shape: 'rotate-45 rounded-none' },
    { label: 'Decision', color: '#3b82f6', shape: 'rounded-none' },
    { label: 'Memory', color: '#06b6d4', shape: 'rounded-full' },
    { label: 'Event', color: '#64748b', shape: 'rounded-lg' },
  ];

  return (
    <div className="flex flex-wrap gap-3 px-3 py-1.5 border-t border-border text-[9px] text-zinc-500">
      {items.map(({ label, color, shape }) => (
        <div key={label} className="flex items-center gap-1">
          <span
            className={`h-2.5 w-2.5 border ${shape}`}
            style={{ borderColor: color, backgroundColor: `${color}30` }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function KnowledgeGraphTab() {
  const {
    nodes: initialNodes,
    edges: initialEdges,
    loading,
    filters,
    toggleFilter,
    selectedNode,
    onNodeClick,
    setSelectedNode,
  } = useKnowledgeGraph(true);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when data updates
  const nodesKey = useMemo(() => initialNodes.map((n: Node) => n.id).sort().join(','), [initialNodes]);
  const edgesKey = useMemo(() => initialEdges.map((e: Edge) => e.id).sort().join(','), [initialEdges]);

  // Update nodes/edges when the source data changes
  const prevNodesKeyRef = useMemo(() => ({ current: '' }), []);
  const prevEdgesKeyRef = useMemo(() => ({ current: '' }), []);

  if (nodesKey !== prevNodesKeyRef.current) {
    prevNodesKeyRef.current = nodesKey;
    if (nodes.length === 0 || nodes.map(n => n.id).sort().join(',') !== nodesKey) {
      setNodes(initialNodes);
    }
  }
  if (edgesKey !== prevEdgesKeyRef.current) {
    prevEdgesKeyRef.current = edgesKey;
    setEdges(initialEdges);
  }

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    onNodeClick(_event, node);
  }, [onNodeClick]);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  if (loading && initialNodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
        Loading knowledge graph...
      </div>
    );
  }

  if (initialNodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-xs gap-2">
        <span>No knowledge data available yet.</span>
        <span className="text-[10px]">Run some tasks to generate patterns, decisions, and learnings.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <FilterBar
        filters={filters}
        toggleFilter={toggleFilter}
        nodeCount={nodes.length}
        edgeCount={edges.length}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-h-0" style={{ height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { strokeWidth: 1.5 },
            }}
          >
            <Background color="#27272a" gap={20} size={1} />
            <Controls
              showInteractive={false}
              className="!bg-zinc-900 !border-zinc-700 !shadow-xl [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700"
            />
            <MiniMap
              nodeStrokeColor={(n) => n.data?.color || '#666'}
              nodeColor={(n) => `${n.data?.color || '#666'}40`}
              maskColor="#09090b80"
              className="!bg-zinc-900 !border-zinc-700"
            />
          </ReactFlow>
        </div>

        <DetailSidebar node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>

      <GraphLegend />
    </div>
  );
}
