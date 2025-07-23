'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { placeholderProjects } from '@/modules/projects/data';
import { placeholderUsers } from '@/modules/users/data';
import { useCompany } from '@/context/company-context';
import { ProjectTaskViews } from '@/modules/projects/components/project-task-views';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';

export default function ProjectDetailsPage({ params }: { params: { id: string } }) {
  const { selectedCompany } = useCompany();
  const currentUser = placeholderUsers[0]; // Mock current user

  const project = React.useMemo(() => {
    const p = placeholderProjects.find(
      (proj) => proj.id === params.id && proj.companyId === selectedCompany?.id
    );
    if (!p) return null;

    const canView = p.visibility === 'Public' || p.memberIds?.includes(currentUser.id) || currentUser.role === 'Admin';
    if (!canView) return null;

    return p;
  }, [params, selectedCompany, currentUser]);

  if (!project) {
    // In a real app, you might want a more sophisticated "not found" or "access denied" page
    notFound();
    return null;
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">{project.name}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
        <CreateTaskSheet />
      </div>

      <ProjectTaskViews project={project} />
    </div>
  );
}
