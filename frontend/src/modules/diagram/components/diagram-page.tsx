'use client';

import { TaskDiagram } from '@/modules/diagram/components/task-diagram';
import { useI18n } from '@/context/i18n-context';

export function DiagramPage() {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <h1 className="text-3xl font-bold font-headline">{t('diagram.title')}</h1>
        <p className="text-muted-foreground">
          {t('diagram.subtitle')}
        </p>
      </div>
      <div className="flex-1 rounded-lg border bg-card text-card-foreground shadow-sm">
        <TaskDiagram />
      </div>
    </div>
  );
}
