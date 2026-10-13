/** A catalogue influencer's Instagram photo, or their initials when Peak has none. */
export function InfluencerPhoto({ id, name, photoAt, size = 'sm' }: { id: string; name: string; photoAt: string | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 text-xl' : 'h-12 w-12 text-base';
  const px = size === 'lg' ? 64 : 48;
  if (photoAt) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by the portal's own route, sized here
      <img src={`/api/directory/${encodeURIComponent(id)}/photo?v=${encodeURIComponent(photoAt)}`} alt="" width={px} height={px} loading="lazy"
        className={`${box} shrink-0 rounded-full border border-line object-cover`} />
    );
  }
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
  return <span aria-hidden="true" className={`${box} flex shrink-0 items-center justify-center rounded-full bg-ink/[0.06] font-semibold text-ink-soft`}>{initials}</span>;
}
