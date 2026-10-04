import { formatDate } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

/** Figures synced from the influencer's own connected account, not typed by staff. */
export function VerifiedMark({ asOf, lang, compact = false }: { asOf?: string; lang: Lang; compact?: boolean }) {
  // Only show a date that is real; results carry their checkpoint instead.
  const label = asOf ? `${t(lang, 'social.verified')} · ${t(lang, 'social.asOf')} ${formatDate(asOf, lang)}` : t(lang, 'social.verified');
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent" title={label}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.5 9.6 3l2.2-.2.4 2.2 1.9 1.2-.9 2 .9 2-1.9 1.2-.4 2.2-2.2-.2L8 14.5 6.4 13l-2.2.2-.4-2.2-1.9-1.2.9-2-.9-2 1.9-1.2.4-2.2 2.2.2z" />
        <path d="m5.6 8.1 1.6 1.6 3.2-3.3" />
      </svg>
      {compact ? <span className="sr-only">{label}</span> : <span><bdi>{label}</bdi></span>}
    </span>
  );
}
