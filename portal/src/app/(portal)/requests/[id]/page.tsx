import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileList } from '@/components/file-list';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getRequest } from '@/lib/requests';
import { currentLang } from '@/lib/session';
import { backLink } from '@/components/field';

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const req = await getRequest(id);
  if (!req) notFound();

  const dates = req.startDate || req.endDate
    ? `${formatDate(req.startDate, lang)}  ${lang === 'ar' ? 'إلى' : 'to'}  ${formatDate(req.endDate, lang)}`
    : null;

  return (
    <div className="space-y-10">
      <Link href="/requests" className={backLink}>{t(lang, 'req.back')}</Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 dir="auto" className="text-3xl font-semibold tracking-tight md:text-4xl">{req.title}</h1>
          <StatusBadge lang={lang} request={req.status} />
        </div>
        <p className="text-sm text-ink-soft">{t(lang, 'req.created')} <bdi>{formatDate(req.createdAt, lang)}</bdi></p>
      </header>

      <section aria-labelledby="proposals-title">
        <h2 id="proposals-title" className="mb-3 text-base font-semibold">{t(lang, 'req.proposals')}</h2>
        {req.proposals.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'req.noProposals')}</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {req.proposals.map((p) => (
              <li key={p.id}>
                <Link href={`/proposals/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-1 py-4 hover:bg-surface sm:px-3">
                  <span className="min-w-0">
                    <span dir="auto" className="block truncate font-medium">{p.title}</span>
                    <span className="block text-sm text-ink-soft"><bdi dir="ltr">{p.number}</bdi></span>
                  </span>
                  <StatusBadge lang={lang} proposal={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brief-title" className="max-w-3xl">
        <h2 id="brief-title" className="sr-only">{t(lang, 'req.objective')}</h2>
        <dl className="divide-y divide-line border-y border-line">
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="text-sm text-ink-soft">{t(lang, 'req.objective')}</dt>
            <dd dir="auto" className="whitespace-pre-line leading-relaxed">{req.objective}</dd>
          </div>
          {req.budget !== null && (
            <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{t(lang, 'req.budget')}</dt>
              <dd className="font-medium"><bdi dir="ltr">{formatMoney(req.budget, req.currency, lang)}</bdi></dd>
            </div>
          )}
          {dates && (
            <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{t(lang, 'req.dates')}</dt>
              <dd className="font-medium">{dates}</dd>
            </div>
          )}
          {req.platforms.length > 0 && (
            <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{t(lang, 'req.platforms')}</dt>
              <dd className="font-medium"><bdi>{req.platforms.join(listSep(lang))}</bdi></dd>
            </div>
          )}
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="text-sm text-ink-soft">{t(lang, 'req.shortlist')}</dt>
            <dd className="font-medium">
              {req.influencers.length === 0 ? <span className="text-ink-soft">{t(lang, 'req.none')}</span> : (
                <ul className="space-y-1">
                  {req.influencers.map((i) => (
                    <li key={i.id}><Link href={`/influencers/${i.id}`} className="underline underline-offset-4">{i.name}</Link></li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          {req.files.length > 0 && (
            <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <dt className="text-sm text-ink-soft">{t(lang, 'req.files')}</dt>
              <dd><FileList files={req.files} lang={lang} /></dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
