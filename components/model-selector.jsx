'use client';

import { useProjectConfig } from '@/context/project-config-context';

export default function ModelSelector({ value, onChange, className = '' }) {
  const { models: MODELS } = useProjectConfig();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`btn-mini w-full py-1.5 px-2 normal-case text-[10px] ${className}`}
    >
      {MODELS.map(m => (
        <option key={m.id} value={m.id}>{m.short}</option>
      ))}
    </select>
  );
}
