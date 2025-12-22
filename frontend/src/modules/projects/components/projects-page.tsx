'use client';

import * as React from 'react';
import { CreateProjectSheet } from '@/modules/projects/components/create-project-sheet';
import { ProjectTable } from '@/modules/projects/components/project-table';
import { ProjectList } from '@/modules/projects/components/project-list';
import { useAuthGuard } from '@/hooks/use-auth-guard';

export function ProjectsPage() {
  const { user } = useAuthGuard();

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">Projects</h1>
          <p className="text-muted-foreground">
            Select a project to view its tasks or see all tasks below.
          </p>
        </div>
        {user && ['Admin', 'Manager'].includes(user.role) && (
           <div className="flex items-center gap-2">
              <CreateProjectSheet />
          </div>
        )}
      </div>

      <ProjectList />

      <div className="flex-1 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold font-headline">All Tasks</h2>
          </div>
          <ProjectTable />
      </div>
    </div>
  );
}
