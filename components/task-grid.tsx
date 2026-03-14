'use client';

import { useProjectConfig } from '@/context/project-config-context';
import TaskCard from './task-card';

export default function TaskGrid() {
  const { tasks: TASKS } = useProjectConfig();

  return (
    <>
      <div className="section-title">Tasks</div>
      <div className="grid grid-cols-3 gap-4 mb-6 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {TASKS.map(task => <TaskCard key={task.id} task={task} />)}
      </div>
    </>
  );
}
