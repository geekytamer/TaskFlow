'use client';

import * as React from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { getProjectById } from '@/services/projectService';
import { getCurrentUser } from '@/services/userService';
import type { Project, User } from '@/lib/types';
import { useCompany } from '@/context/company-context';
import { ProjectTaskViews } from '@/modules/projects/components/project-task-views';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { selectedCompany } = useCompany();
  const [project, setProject] = React.useState<Project | null>(null);
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchData() {
      if (!id || !selectedCompany) return;
      
      setLoading(true);
      const [projectData, userData] = await Promise.all([
        getProjectById(id),
        getCurrentUser(),
      ]);
      
      if (!projectData || projectData.companyId !== selectedCompany.id) {
        // Project doesn't exist or doesn't belong to the selected company
        router.push('/projects');
        return;
      }

      const canView = projectData.visibility === 'Public' || projectData.memberIds?.includes(userData.id) || userData.role === 'Admin';

      if (!canView) {
        // User doesn't have permission to view this private project
        router.push('/projects');
        return;
      }
      
      setProject(projectData);
      setCurrentUser(userData);
      setLoading(false);
    }

    fetchData();
  }, [id, selectedCompany, router]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!project) {
    // This case handles when the project is not found or user is redirected.
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
