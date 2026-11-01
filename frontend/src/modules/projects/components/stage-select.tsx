'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { getMilestones } from '@/services/projectService';
import type { ProjectMilestone } from '../types';

/** The stages of a project, for putting a task in one. Renders nothing for a project without stages. */
export function useProjectStages(projectId: string | undefined | null) {
  const [stages, setStages] = React.useState<ProjectMilestone[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    if (!projectId) { setStages([]); return; }
    getMilestones(projectId).then((s) => { if (!cancelled) setStages(s); }).catch(() => { if (!cancelled) setStages([]); });
    return () => { cancelled = true; };
  }, [projectId]);
  return stages;
}

export function StageSelect({ stages, value, onChange, className }: { stages: ProjectMilestone[]; value: string | null | undefined; onChange: (id: string | null) => void; className?: string }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{tr('No stage', 'بدون مرحلة')}</SelectItem>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
