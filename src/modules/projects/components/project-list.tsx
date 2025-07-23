'use client';

import * as React from 'react';
import { getProjects } from '@/services/projectService';
import { getCurrentUser } from '@/services/userService';
import { useCompany } from '@/context/company-context';
import type { Project, User } from '@/lib/types';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

export function ProjectList() {
  const { selectedCompany } = useCompany();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadData() {
      if (!selectedCompany) return;
      setLoading(true);
      const [projectsData, currentUserData] = await Promise.all([
        getProjects(),
        getCurrentUser()
      ]);
      setProjects(projectsData);
      setCurrentUser(currentUserData);
      setLoading(false);
    }
    loadData();
  }, [selectedCompany]);

  const visibleProjects = React.useMemo(() => {
    if (!currentUser || !selectedCompany) return [];
    return projects.filter(
      (p) =>
        p.companyId === selectedCompany.id &&
        (p.visibility === 'Public' ||
          p.memberIds?.includes(currentUser.id) ||
          currentUser.role === 'Admin')
    );
  }, [projects, currentUser, selectedCompany]);
  
  if (loading) {
      return (
           <div className="flex w-max space-x-4 pb-4">
               {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className='w-[280px] h-[120px]' />
               ))}
           </div>
      )
  }

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
