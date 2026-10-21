'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/i18n-context';

export interface SegmentOption<T extends string> { value: T; label: string }

/**
 * A segmented single choice (None / View / Edit / Full / Custom). Radix radio
 * group underneath: one tab stop, arrow keys move and select, the direction
 * follows the page (RTL), and screen readers hear a radio group.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentOption<T>>;
  /** Accessible name of the group, e.g. "Sales level". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const { isRtl } = useI18n();
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={label}
      disabled={disabled}
      dir={isRtl ? 'rtl' : 'ltr'}
      orientation="horizontal"
      className={cn('inline-flex w-full rounded-md border bg-muted/50 p-0.5 sm:w-auto', className)}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            'min-h-8 flex-1 whitespace-nowrap rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors sm:w-[3.75rem] sm:flex-none',
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-inset data-[state=checked]:ring-primary/50',
            'disabled:cursor-not-allowed disabled:hover:text-muted-foreground',
          )}
        >
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
