'use client';

import type { Project } from '@/modules/projects/types';
import { useI18n } from '@/context/i18n-context';
import { displayName } from '@/lib/display-name';

interface ProjectLegendProps {
  projects: Project[];
}

export function ProjectLegend({ projects }: ProjectLegendProps) {
  const { language } = useI18n();
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {projects.map((project) => (
        <div key={project.id} className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="text-xs font-medium text-muted-foreground">{displayName(project, language)}</span>
        </div>
      ))}
    </div>
  );
}
