import type { Branding } from '@/lib/portal';

export function BrandMark({ branding, tone = 'ink' }: { branding: Branding | null; tone?: 'ink' | 'light' }) {
  const name = branding?.name ?? 'Portal';
  if (branding?.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.logoUrl} alt={name} className="h-8 w-auto max-w-[180px] object-contain" />;
  }
  return (
    <span className={`text-lg font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink'}`}>{name}</span>
  );
}
