'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const ProjectConfigContext = createContext(null);

export function ProjectConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  const loadConfig = () => {
    setError(null);
    fetch('/api/project-config')
      .then(r => r.json())
      .then(setConfig)
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-400 font-mono text-sm mb-3">Config load failed: {error}</div>
          <button
            onClick={loadConfig}
            className="px-3 py-1.5 text-sm font-mono rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm text-zinc-500">Loading configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <ProjectConfigContext.Provider value={config}>
      {children}
    </ProjectConfigContext.Provider>
  );
}

export function useProjectConfig() {
  const ctx = useContext(ProjectConfigContext);
  if (!ctx) throw new Error('useProjectConfig must be inside ProjectConfigProvider');
  return ctx;
}
