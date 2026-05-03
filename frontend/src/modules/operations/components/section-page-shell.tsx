'use client';

import * as React from 'react';
import { localizeUiText } from '@/lib/ui-text';
import { cn } from '@/lib/utils';

type SectionPageShellProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionPageShell({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionPageShellProps) {
  const localizedTitle = localizeUiText(title);
  const localizedDescription = localizeUiText(description);
  return (
    <div className={cn('flex h-full flex-col gap-6', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-headline">{localizedTitle}</h1>
          <p className="max-w-3xl text-muted-foreground">{localizedDescription}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className={cn('flex flex-col gap-6', contentClassName)}>{children}</div>
    </div>
  );
}
