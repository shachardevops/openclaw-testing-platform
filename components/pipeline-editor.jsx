'use client';

import { useState } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { useProjectConfig } from '@/context/project-config-context';

export default function PipelineEditor({ pipeline, onClose }) {
  const { createPipeline, updatePipeline } = useDashboard();
  const { tasks: TASKS } = useProjectConfig();
  const isEdit = !!pipeline;
  const [name, setName] = useState(pipeline?.name || '');
  const [selected, setSelected] = useState(new Set(pipeline?.taskIds || []));

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const save = () => {
    const taskIds = TASKS.filter(t => selected.has(t.id)).map(t => t.id);
    if (!name.trim() || !taskIds.length) return;
    if (isEdit) updatePipeline(pipeline.id, { name: name.trim(), taskIds });
    else createPipeline(name.trim(), taskIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-elevated border border-border-bright rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4">{isEdit ? 'Edit Pipeline' : 'New Pipeline'}</h3>

        <label className="block text-[10px] text-zinc-500 mb-1 font-mono uppercase tracking-wider">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-zinc-200 mb-4 font-mono"
          placeholder="Pipeline name..."
        />

        <label className="block text-[10px] text-zinc-500 mb-2 font-mono uppercase tracking-wider">Tasks</label>
        <div className="space-y-1 mb-4">
          {TASKS.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-card-hover text-xs">
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-accent" />
              <span>{t.icon}</span>
              <span className="text-zinc-300">S{t.num}: {t.title}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
