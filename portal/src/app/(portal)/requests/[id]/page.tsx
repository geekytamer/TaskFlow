import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileList } from '@/components/file-list';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key } from '@/lib/i18n';
import { getRequest } from '@/lib/requests';
import { currentLang } from '@/lib/session';
import { PageHeader, RowLink, SectionTitle, list, panel } from '@/components/ui';

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
    <div className="space-y-8">
      <PageHeader
        back={{ href: '/requests', label: t(lang, 'req.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{req.title}</bdi><StatusBadge lang={lang} request={req.status} /></span>}
        subtitle={<>{t(lang, 'req.created')} <bdi>{formatDate(req.createdAt, lang)}</bdi></>}
      />

      <Progress status={req.status} lang={lang} />

      {req.closedReason && (
        <section aria-labelledby="note-title" className={`${panel} max-w-3xl p-5`}>
          <h2 id="note-title" className="text-sm font-semibold">{t(lang, 'req.peakNote')}</h2>
          <p dir="auto" className="mt-1 whitespace-pre-line leading-relaxed">{req.closedReason}</p>
        </section>
      )}

      <section aria-labelledby="proposals-title">
        <SectionTitle id="proposals-title">{t(lang, 'req.proposals')}</SectionTitle>
        {req.proposals.length === 0 ? (
          <p className="text-ink-soft">{t(lang, 'req.noProposals')}</p>
        ) : (
          <ul className={list}>
            {req.proposals.map((p) => (
              <li key={p.id}>
                <RowLink href={`/proposals/${p.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium"><bdi>{p.title}</bdi></span>
                      <span className="block text-sm text-ink-soft"><bdi dir="ltr">{p.number}</bdi></span>
                    </span>
                    <StatusBadge lang={lang} proposal={p.status} />
                  </div>
                </RowLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brief-title" className="max-w-3xl">
        <h2 id="brief-title" className="sr-only">{t(lang, 'req.objective')}</h2>
        <dl className={`${panel} divide-y divide-line px-5`}>
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

/** Where the request stands: sent, proposal, the client's decision; and what happens next. */
function Progress({ status, lang }: { status: 'in_review' | 'proposal_ready' | 'accepted' | 'closed'; lang: 'en' | 'ar' }) {
  const reached = status === 'in_review' ? 1 : status === 'proposal_ready' ? 2 : 3;
  const steps = ['req.step.sent', 'req.step.proposal', 'req.step.decision'] as const;
  return (
    <section aria-label={t(lang, `req.next.${status}` as Key)} className="max-w-3xl space-y-3">
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((key, i) => {
          const done = i < reached && status !== 'closed';
          return (
            <li key={key} className="space-y-1.5">
              <span aria-hidden="true" className={`block h-1.5 rounded-full ${done ? 'bg-accent' : status === 'closed' && i < reached ? 'bg-ink/30' : 'bg-ink/10'}`} />
              <span className={`block text-xs ${done ? 'font-medium text-ink' : 'text-ink-soft'}`}>{t(lang, key)}</span>
            </li>
          );
        })}
      </ol>
      <p className={`text-[15px] ${status === 'proposal_ready' ? 'font-medium text-accent' : 'text-ink-soft'}`}>{t(lang, `req.next.${status}` as Key)}</p>
    </section>
  );
}
