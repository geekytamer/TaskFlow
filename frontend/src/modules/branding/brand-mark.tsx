'use client';

import { cn } from '@/lib/utils';
import { useBrand } from './brand-context';

/** The app's mark: the company's logo and name when branded, the group's otherwise. */
export function BrandMark({
  className,
  logoClassName = 'h-6 w-6',
  nameClassName = 'font-headline text-2xl font-bold text-primary',
  hideNameClassName,
}: {
  className?: string;
  logoClassName?: string;
  nameClassName?: string;
  /** Extra classes for the name, e.g. hiding it when the sidebar collapses. */
  hideNameClassName?: string;
}) {
  const { name, logoUrl, ready } = useBrand();
  return (
    // Hidden until the remembered brand is known, so the wrong name never flashes first.
    <div className={cn('flex min-w-0 items-center gap-2', !ready && 'invisible', className)}>
      <img
        src={logoUrl ?? '/brand/emblem.png'}
        alt=""
        className={cn('shrink-0 object-contain', logoUrl && 'rounded-md', logoClassName)}
      />
      <span className={cn('truncate', nameClassName, hideNameClassName)}>{name}</span>
    </div>
  );
}
