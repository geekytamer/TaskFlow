import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getRequests } from '@/lib/requests';
import { currentLang } from '@/lib/session';

const newButton =
  'inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ink/90';

export default async function RequestsPage() {
  requireAudience('client');
  const lang = await currentLang();
  const requests = await getRequests();

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'req.title')}</h1>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'req.subtitle')}</p>
        </div>
        {requests.length > 0 && <Link href="/requests/new" className={newButton}>{t(lang, 'req.new')}</Link>}
      </header>

      {requests.length === 0 ? (
        <section className="max-w-xl border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'req.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'req.emptyBody')}</p>
          <Link href="/requests/new" className={`${newButton} mt-5`}>{t(lang, 'req.new')}</Link>
        </section>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="grid gap-2 px-1 py-5 transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold"><bdi>{r.title}</bdi></p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {t(lang, 'req.created')} <bdi>{formatDate(r.createdAt, lang)}</bdi>
                  </p>
                </div>
                <StatusBadge lang={lang} request={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
