import { formatCompact } from '@/lib/format';
import { t, type Key, type Lang } from '@/lib/i18n';

export interface Figures { views: number; likes: number; comments: number; saves: number; shares: number }

const ORDER: Array<keyof Figures> = ['views', 'likes', 'comments', 'saves', 'shares'];

/** Post results as a quiet row of labelled numbers; views lead because they carry the most weight. */
export function ResultsFigures({ figures, lang, size = 'sm' }: { figures: Figures; lang: Lang; size?: 'sm' | 'lg' }) {
  return (
    <dl className={`flex flex-wrap gap-x-5 gap-y-1 ${size === 'lg' ? 'text-base' : 'text-sm'}`}>
      {ORDER.map((k, i) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="text-ink-soft">{t(lang, `social.${k}` as Key)}</dt>
          <dd className={`tabular-nums ${i === 0 ? 'font-semibold' : 'font-medium'} ${size === 'lg' && i === 0 ? 'text-xl' : ''}`}>
            <bdi>{formatCompact(figures[k], lang)}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}
