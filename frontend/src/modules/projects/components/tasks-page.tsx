'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { TaskList } from './task-list';
import { CreateTaskSheet } from './create-task-sheet';

export function TasksPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t('tasksPage.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('tasksPage.subtitle')}</p>
        </div>
        <CreateTaskSheet />
      </div>

      <TaskList />
    </div>
  );
}
