'use client';

import * as React from 'react';
import { placeholderProjects } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import { useCompany } from '@/context/company-context';
import type { Project } from '@/modules/projects/types';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function ProjectList() {
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
                {visibleProjects.map((project) => (
                    <a href={`/projects/${project.id}`} key={project.id}>
                        <Card
                            className='w-[280px] h-[120px] cursor-pointer hover:border-primary transition-colors'
                        >
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: project.color}} />
                                    <CardTitle className="truncate">{project.name}</CardTitle>
                                </div>
                                <CardDescription className="truncate h-10 whitespace-normal">{project.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </a>
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </div>
  );
}
