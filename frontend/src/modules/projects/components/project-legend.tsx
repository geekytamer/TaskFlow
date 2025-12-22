'use client';

import type { Project } from '@/modules/projects/types';

interface ProjectLegendProps {
  projects: Project[];
}

export function ProjectLegend({ projects }: ProjectLegendProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {projects.map((project) => (
        <div key={project.id} className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="text-xs font-medium text-muted-foreground">{project.name}</span>
        </div>
      ))}
    </div>
  );
}
