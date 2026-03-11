'use client';

import { ProjectConfigProvider } from '@/context/project-config-context';
import { DashboardProvider } from '@/context/dashboard-context';
import Header from '@/components/header';
import PipelineBuilder from '@/components/pipeline-builder';
import SessionPanel from '@/components/session-panel';

export default function DashboardPage() {
  return (
    <ProjectConfigProvider>
      <DashboardProvider>
        <div className="h-screen flex flex-col overflow-hidden">
          <Header />
          <div className="flex flex-1 min-h-0">
            <PipelineBuilder />
            <SessionPanel />
          </div>
        </div>
      </DashboardProvider>
    </ProjectConfigProvider>
  );
}
