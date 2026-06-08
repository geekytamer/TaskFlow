import { cn } from '@/lib/utils';
import type { Company } from '../types';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CO';
}

export function CompanyMark({
  company,
  className,
}: {
  company: Pick<Company, 'name' | 'logoUrl'>;
  className?: string;
}) {
  return company.logoUrl ? (
    <img
      src={company.logoUrl}
      alt=""
      className={cn('h-8 w-8 shrink-0 rounded-md border object-contain bg-white', className)}
    />
  ) : (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground',
        className,
      )}
      aria-hidden="true"
    >
      {initials(company.name)}
    </span>
  );
}
