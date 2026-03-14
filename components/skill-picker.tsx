'use client';

import { useState, useRef, useEffect } from 'react';
import { useProjectConfig } from '@/context/project-config-context';

interface SkillPickerProps {
  attachedIds?: string[];
  onToggle: (skillId: string) => void;
}

export default function SkillPicker({ attachedIds = [], onToggle }: SkillPickerProps) {
  const { skills: SKILLS } = useProjectConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="role-badge role-badge-add"
        title="Add skill"
      >+</button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-elevated border border-border-bright rounded-lg p-1.5 shadow-xl min-w-[260px]">
          {SKILLS.map(skill => (
            <label
              key={skill.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-card-hover text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={attachedIds.includes(skill.id)}
                onChange={() => onToggle(skill.id)}
                className="mt-0.5 accent-accent"
              />
              <span className="pt-0.5">{(skill as Record<string, unknown>).icon as string}</span>
              <span className="min-w-0">
                <span className="block text-zinc-300">{skill.name}</span>
                {skill.description && (
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-zinc-500">
                    {skill.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
