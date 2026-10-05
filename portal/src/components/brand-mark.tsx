import type { Branding } from '@/lib/portal';

/**
 * The portal's logo. A deployment can set its own light-on-dark artwork
 * (PORTAL_LOGO_URL for the full logo, PORTAL_MARK_URL for the compact mark),
 * since a company logo drawn for white paper can vanish on the dark ground.
 * Otherwise the company's logo, otherwise its name.
 */
export function BrandMark({ branding, variant = 'full', className }: { branding: Branding | null; variant?: 'full' | 'mark'; className?: string }) {
  const name = branding?.name ?? 'Portal';
  const own = variant === 'mark' ? process.env.PORTAL_MARK_URL || process.env.PORTAL_LOGO_URL : process.env.PORTAL_LOGO_URL;
  const src = own || branding?.logoUrl;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={className ?? (variant === 'mark' ? 'h-8 w-auto' : 'h-12 w-auto max-w-[180px] object-contain')} />;
  }
  return <span className="text-lg font-semibold tracking-tight text-ink">{name}</span>;
}
