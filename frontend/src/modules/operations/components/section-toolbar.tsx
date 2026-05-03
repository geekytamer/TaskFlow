'use client';

import * as React from 'react';
import { localizeUiNode } from '@/lib/ui-text';

type SectionToolbarProps = {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
};

export function SectionToolbar({
  search,
  filters,
  summary,
  actions,
}: SectionToolbarProps) {
  const localizedSummary = localizeUiNode(summary);
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
        {search}
        {filters}
        {localizedSummary ? <div className="text-sm text-muted-foreground">{localizedSummary}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
