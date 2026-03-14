'use client';

import { useState } from 'react';
import SwarmPanel from './swarm-panel';
import ConsensusView from './consensus-view';
import DriftMonitor from './drift-monitor';
import RLInsights from './rl-insights';
import SemanticSearch from './semantic-search';
import KnowledgeGraphView from './knowledge-graph-view';

const TABS = [
  { id: 'swarm', label: 'Swarm', icon: '' },
  { id: 'consensus', label: 'Consensus', icon: '' },
  { id: 'drift', label: 'Anti-Drift', icon: '' },
  { id: 'rl', label: 'RL/SONA', icon: '' },
  { id: 'search', label: 'Search', icon: '' },
  { id: 'graph', label: 'Knowledge', icon: '' },
];

export default function RufloPanel() {
  const [activeTab, setActiveTab] = useState('swarm');

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-700 bg-zinc-800/50">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === 'swarm' && <SwarmPanel />}
        {activeTab === 'consensus' && <ConsensusView />}
        {activeTab === 'drift' && <DriftMonitor />}
        {activeTab === 'rl' && <RLInsights />}
        {activeTab === 'search' && <SemanticSearch />}
        {activeTab === 'graph' && <KnowledgeGraphView />}
      </div>
    </div>
  );
}
