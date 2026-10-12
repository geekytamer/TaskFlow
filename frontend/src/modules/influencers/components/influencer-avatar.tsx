'use client';

import * as React from 'react';
import { getInfluencerPhotos, influencerPhotoUrl } from '@/services/discoverService';
import { cn } from '@/lib/utils';

/** Which influencers have a photo (from the weekly Instagram check or their connection). Null while loading. */
export function useInfluencerPhotos(companyId: string | undefined): Record<string, string> | null {
  const [photos, setPhotos] = React.useState<Record<string, string> | null>(null);
  React.useEffect(() => {
    if (!companyId) { setPhotos({}); return; }
    let cancelled = false;
    void getInfluencerPhotos(companyId).then((p) => { if (!cancelled) setPhotos(p); });
    return () => { cancelled = true; };
  }, [companyId]);
  return photos;
}

const SIZES = { sm: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' } as const;

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

/**
 * An influencer's Instagram photo, loaded when it scrolls into view (the API
 * needs the sign-in header, so it comes as an object URL); initials otherwise.
 */
export function InfluencerAvatar({ contactId, name, photoAt, size = 'sm', className }: {
  contactId: string; name: string; photoAt?: string | null; size?: keyof typeof SIZES; className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  React.useEffect(() => {
    setUrl(null);
    if (!photoAt || !visible) return;
    let cancelled = false;
    let created: string | null = null;
    influencerPhotoUrl(contactId).then((u) => {
      if (cancelled) { if (u) URL.revokeObjectURL(u); } else { created = u; setUrl(u); }
    }).catch(() => undefined);
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [contactId, photoAt, visible]);

  return (
    <span ref={ref} className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted font-semibold text-muted-foreground', SIZES[size], className)}>
      {url
        // eslint-disable-next-line @next/next/no-img-element -- object URL from the API
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  );
}
