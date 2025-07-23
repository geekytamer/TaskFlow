'use client';

import * as React from 'react';
import { placeholderProjects } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import { useCompany } from '@/context/company-context';
import type { Project } from '@/modules/projects/types';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ProjectListProps {
    onProjectSelect: (project: Project | null) => void;
    selectedProject: Project | null;
}

export function ProjectList({ onProjectSelect, selectedProject }: ProjectListProps) {
  const { selectedCompany } = useCompany();
  const currentUser = placeholderUsers[0]; // Mock current user

  const visibleProjects = React.useMemo(() => {
    return placeholderProjects.filter(
      (p) =>
        p.companyId === selectedCompany?.id &&
        (p.visibility === 'Public' ||
          p.memberIds?.includes(currentUser.id) ||
          currentUser.role === 'Admin')
    );
  }, [currentUser, selectedCompany]);

  return (
    <div>
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max space-x-4 pb-4">
                <Card
                    onClick={() => onProjectSelect(null)}
                    className={cn(
                    'w-[250px] cursor-pointer hover:border-primary transition-colors',
                    !selectedProject ? 'border-primary' : ''
                    )}
                >
                    <CardHeader>
                        <CardTitle>All Projects</CardTitle>
                        <CardDescription>View tasks from all projects</CardDescription>
                    </CardHeader>
                </Card>
                {visibleProjects.map((project) => (
                    <Card
                    key={project.id}
                    onClick={() => onProjectSelect(project)}
                    className={cn(
                        'w-[250px] cursor-pointer hover:border-primary transition-colors',
                        selectedProject?.id === project.id ? 'border-primary' : ''
                    )}
                    >
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full" style={{backgroundColor: project.color}} />
                            <CardTitle className="truncate">{project.name}</CardTitle>
                        </div>
                        <CardDescription className="truncate h-10">{project.description}</CardDescription>
                    </CardHeader>
                    </Card>
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </div>
  );
}
