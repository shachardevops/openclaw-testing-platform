'use client';

import dynamic from 'next/dynamic';

const KnowledgeGraphContent = dynamic(
  () => import('./knowledge-graph-content'),
  {
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
        Loading knowledge graph...
      </div>
    ),
    ssr: false,
  }
);

export default function KnowledgeGraphTab() {
  return <KnowledgeGraphContent />;
}
