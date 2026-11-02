'use client';

import * as React from 'react';
import { EyeOff } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

/** The word shown in place of a sensitive value the person may not see. */
export function hiddenText(language: string): string {
  return language === 'ar' ? 'مخفي' : 'Hidden';
}

/**
 * Stands in for a sensitive value (salary, ID numbers, bank details, cost
 * prices, rate cards, client terms) that the person's role does not show.
 */
export function HiddenValue({ className }: { className?: string }) {
  const { language } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-1 text-muted-foreground${className ? ` ${className}` : ''}`}
      title={language === 'ar' ? 'دورك لا يعرض هذه القيمة' : "Your role doesn't show this value"}
      data-testid="hidden-value"
    >
      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
      {hiddenText(language)}
    </span>
  );
}
