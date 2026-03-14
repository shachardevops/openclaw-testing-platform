/**
 * Ruflo Knowledge Graph — entity-relationship graph for QA artifacts.
 *
 * Nodes: stories, bugs, modules, models, runs
 * Edges: story --has_bug--> bug, bug --in_module--> module, etc.
 * Supports PageRank and community detection.
 */

import fs from 'fs';
import path from 'path';
import { getProjectConfig } from '@/lib/project-loader';

function getGraphPath() {
  try {
    const { project } = getProjectConfig();
    const projectId = project?.id || 'ordertu-qa';
    return path.join(process.cwd(), 'config', projectId, 'memory', 'knowledge-graph.json');
  } catch {
    return path.join(process.cwd(), 'config', 'ordertu-qa', 'memory', 'knowledge-graph.json');
  }
}

class KnowledgeGraph {
  constructor() {
    this._nodes = new Map(); // nodeId -> { type, data }
    this._edges = []; // [{ from, relation, to, weight, ts }]
    this._load();
  }

  _load() {
    try {
      const p = getGraphPath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data.nodes) {
          for (const [id, node] of Object.entries(data.nodes)) {
            this._nodes.set(id, node);
          }
        }
        this._edges = data.edges || [];
      }
    } catch { /* start fresh */ }
  }

  _persist() {
    try {
      const p = getGraphPath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const nodes = {};
      for (const [id, node] of this._nodes) nodes[id] = node;
      fs.writeFileSync(p, JSON.stringify({
        nodes,
        edges: this._edges,
        updatedAt: new Date().toISOString(),
        stats: { nodeCount: this._nodes.size, edgeCount: this._edges.length },
      }, null, 2));
    } catch { /* best-effort */ }
  }

  /**
   * Add or update a node.
   */
  addNode(id, type, data = {}) {
    this._nodes.set(id, { type, ...data, updatedAt: new Date().toISOString() });
    this._persist();
  }

  /**
   * Add an edge (relationship).
   */
  addEdge(from, relation, to, weight = 1.0) {
    // Avoid exact duplicates
    const exists = this._edges.some(e => e.from === from && e.relation === relation && e.to === to);
    if (!exists) {
      this._edges.push({ from, relation, to, weight, ts: Date.now() });
      this._persist();
    }
  }

  /**
   * Query edges from/to a node.
   */
  query(nodeId, relation = null) {
    return this._edges.filter(e => {
      const matchesNode = e.from === nodeId || e.to === nodeId;
      const matchesRelation = !relation || e.relation === relation;
      return matchesNode && matchesRelation;
    });
  }

  /**
   * Get neighbors of a node.
   */
  neighbors(nodeId) {
    const edges = this.query(nodeId);
    const neighborIds = new Set();
    for (const e of edges) {
      if (e.from === nodeId) neighborIds.add(e.to);
      if (e.to === nodeId) neighborIds.add(e.from);
    }
    return [...neighborIds].map(id => ({ id, ...this._nodes.get(id) }));
  }

  /**
   * Simple PageRank (power iteration).
   */
  pageRank(iterations = 20, damping = 0.85) {
    const nodes = [...this._nodes.keys()];
    const n = nodes.length;
    if (n === 0) return {};

    const rank = {};
    for (const node of nodes) rank[node] = 1 / n;

    // Build adjacency
    const outLinks = {};
    for (const node of nodes) outLinks[node] = [];
    for (const edge of this._edges) {
      if (outLinks[edge.from]) outLinks[edge.from].push(edge.to);
    }

    for (let i = 0; i < iterations; i++) {
      const newRank = {};
      for (const node of nodes) newRank[node] = (1 - damping) / n;

      for (const node of nodes) {
        const out = outLinks[node];
        if (out.length === 0) continue;
        const share = rank[node] / out.length;
        for (const target of out) {
          newRank[target] = (newRank[target] || 0) + damping * share;
        }
      }

      for (const node of nodes) rank[node] = newRank[node] || 0;
    }

    return rank;
  }

  /**
   * Simple community detection (connected components via BFS).
   */
  findCommunities() {
    const visited = new Set();
    const communities = [];

    for (const nodeId of this._nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const community = [];
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        community.push(current);

        for (const neighbor of this.neighbors(current)) {
          if (!visited.has(neighbor.id)) queue.push(neighbor.id);
        }
      }
      if (community.length > 0) communities.push(community);
    }

    return communities;
  }

  /**
   * Get graph stats.
   */
  getStats() {
    return {
      nodeCount: this._nodes.size,
      edgeCount: this._edges.length,
      nodeTypes: this._getNodeTypeCounts(),
      relationTypes: this._getRelationTypeCounts(),
    };
  }

  _getNodeTypeCounts() {
    const counts = {};
    for (const node of this._nodes.values()) {
      counts[node.type] = (counts[node.type] || 0) + 1;
    }
    return counts;
  }

  _getRelationTypeCounts() {
    const counts = {};
    for (const edge of this._edges) {
      counts[edge.relation] = (counts[edge.relation] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get full graph for visualization.
   */
  toJSON() {
    const nodes = [];
    for (const [id, data] of this._nodes) {
      nodes.push({ id, ...data });
    }
    return { nodes, edges: this._edges };
  }
}

const knowledgeGraph = new KnowledgeGraph();
export default knowledgeGraph;
