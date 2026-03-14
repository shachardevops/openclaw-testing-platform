'use client';

import { useState, useCallback } from 'react';

const COLLECTIONS = ['bugs', 'module-notes', 'run-history', 'agent-issues', 'decisions'];

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ruflo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), collection: collection || undefined, limit: 10 }),
      });
      const data = await res.json();
      if (data.ok) setResults(data.results || data);
    } catch { /* skip */ }
    setLoading(false);
  }, [query, collection]);

  const renderResults = () => {
    if (!results) return null;

    // Single collection results
    if (Array.isArray(results)) {
      return (
        <div className="space-y-2 mt-3">
          {results.map((r, i) => (
            <div key={i} className="p-2 bg-zinc-800 rounded text-sm border border-zinc-700">
              <div className="font-medium text-zinc-200">{r.title || r.id}</div>
              {r._score && <span className="text-xs text-zinc-500 ml-2">Score: {(r._score * 100).toFixed(1)}%</span>}
              {r.text && <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{r.text}</div>}
              {r.source && <div className="text-xs text-zinc-500 mt-1">Source: {r.source}</div>}
            </div>
          ))}
          {results.length === 0 && <div className="text-zinc-500 text-sm">No results found</div>}
        </div>
      );
    }

    // Multi-collection results
    return (
      <div className="space-y-4 mt-3">
        {Object.entries(results).map(([coll, items]) => (
          <div key={coll}>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-1">{coll} ({items.length})</h4>
            {items.map((r, i) => (
              <div key={i} className="p-2 bg-zinc-800 rounded text-sm border border-zinc-700 mb-1">
                <div className="font-medium text-zinc-200">{r.title || r.id}</div>
                {r._score && <span className="text-xs text-zinc-500">Score: {(r._score * 100).toFixed(1)}%</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">Semantic Search</h3>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search bugs, notes, runs..."
          className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-sm text-zinc-200 placeholder-zinc-500"
        />
        <select
          value={collection}
          onChange={e => setCollection(e.target.value)}
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-600 rounded text-sm text-zinc-300"
        >
          <option value="">All collections</option>
          {COLLECTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 rounded text-sm text-white"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>
      {renderResults()}
    </div>
  );
}
