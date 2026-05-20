'use client';

import * as React from 'react';
import { CreateProjectSheet } from '@/modules/projects/components/create-project-sheet';
import { ActivityFeed } from '@/modules/operations/components/activity-feed';
import { ProjectTable } from '@/modules/projects/components/project-table';
import { ProjectList } from '@/modules/projects/components/project-list';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useI18n } from '@/context/i18n-context';
import { useCompany } from '@/context/company-context';
import { canManageProjects } from '@/modules/projects/lib/access';

export function ProjectsPage() {
  const { user } = useAuthGuard();
  const { t } = useI18n();
  const { currentRole } = useCompany();

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('projects.title')}</h1>
          <p className="text-muted-foreground">
            {t('projects.subtitle')}
          </p>
        </div>
        {user && canManageProjects(currentRole) && (
           <div className="flex items-center gap-2" data-tutorial="projects-create-btn">
              <CreateProjectSheet />
          </div>
        )}
      </div>

      <div data-tutorial="projects-list"><ProjectList /></div>

      <div className="flex-1 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold font-headline">{t('projects.allTasks')}</h2>
          </div>
          <div data-tutorial="projects-tasks-table"><ProjectTable /></div>
      </div>

      <ActivityFeed
        title={t('projects.projectActivity')}
        entityType="project"
        limit={8}
        emptyMessage={t('projects.noActivityYet')}
      />
    </div>
  );
}
