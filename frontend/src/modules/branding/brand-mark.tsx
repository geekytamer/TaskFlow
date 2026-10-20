'use client';

import { Logo } from '@/components/icons/logo';
import { cn } from '@/lib/utils';
import { useBrand } from './brand-context';

/** The app's mark: the company's logo and name when branded, TaskFlow's otherwise. */
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
    // Hidden until the remembered brand is known, so "TaskFlow" never flashes first.
    <div className={cn('flex min-w-0 items-center gap-2', !ready && 'invisible', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className={cn('shrink-0 rounded-md object-contain', logoClassName)} />
      ) : (
        <Logo className={cn('shrink-0 text-primary', logoClassName)} />
      )}
      <span className={cn('truncate', nameClassName, hideNameClassName)}>{name}</span>
    </div>
  );
}
