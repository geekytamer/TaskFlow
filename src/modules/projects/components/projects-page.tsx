'use client';

import * as React from 'react';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { CreateProjectSheet } from '@/modules/projects/components/create-project-sheet';
import { ProjectTable } from '@/modules/projects/components/project-table';
import { ProjectList } from '@/modules/projects/components/project-list';
import type { Project } from '@/modules/projects/types';
import { ProjectTaskViews } from './project-task-views';
import { Button } from '@/components/ui/button';

export function ProjectsPage() {
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">Projects</h1>
          <p className="text-muted-foreground">
            {selectedProject 
              ? `Viewing tasks for ${selectedProject.name}`
              : "Select a project to view its tasks or see all tasks below."
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
            <CreateProjectSheet />
            <CreateTaskSheet />
        </div>
      </div>

      <ProjectList onProjectSelect={setSelectedProject} selectedProject={selectedProject} />

      {selectedProject ? (
        <ProjectTaskViews project={selectedProject} />
      ) : (
        <div className="flex-1 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold font-headline">All Tasks</h2>
            </div>
            <ProjectTable />
        </div>
      )}
    </div>
  );
}
