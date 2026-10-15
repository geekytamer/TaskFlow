import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FileList } from '@/components/file-list';
import { InfluencerPhoto } from '@/components/influencer-photo';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney, listSep } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Key } from '@/lib/i18n';
import { linkify } from '@/lib/linkify';
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

  const facts: Array<{ key: Key; value: ReactNode }> = [];
  if (req.budget !== null) facts.push({ key: 'req.budget', value: <bdi dir="ltr">{formatMoney(req.budget, req.currency, lang)}</bdi> });
  if (dates) facts.push({ key: 'req.dates', value: dates });
  if (req.platforms.length > 0) facts.push({ key: 'req.platforms', value: <bdi>{req.platforms.join(listSep(lang))}</bdi> });

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: '/requests', label: t(lang, 'req.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi className="[overflow-wrap:anywhere]">{req.title}</bdi><StatusBadge lang={lang} request={req.status} /></span>}
        subtitle={<>{t(lang, 'req.created')} <bdi>{formatDate(req.createdAt, lang)}</bdi></>}
      />

      {/* One status panel: where the request stands and what happens next (that also covers "no proposal yet"). */}
      <section aria-labelledby="status-title" className={`${panel} p-5 sm:p-6`}>
        <h2 id="status-title" className="sr-only">{t(lang, 'req.status')}</h2>
        <Progress status={req.status} lang={lang} />
        {req.closedReason && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">{t(lang, 'req.peakNote')}</h3>
            <p dir="auto" className="mt-1 max-w-[68ch] whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{req.closedReason}</p>
          </div>
        )}
      </section>

      {req.proposals.length > 0 && (
        <section aria-labelledby="proposals-title">
          <SectionTitle id="proposals-title">{t(lang, 'req.proposals')}</SectionTitle>
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
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        <section aria-labelledby="brief-title" className={`${panel} min-w-0 p-5 sm:p-6`}>
          <h2 id="brief-title" className="text-base font-semibold">{t(lang, 'req.brief')}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{t(lang, 'req.objective')}</p>
          <p dir="auto" className="mt-4 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere]">
            <LinkedText text={req.objective} />
          </p>
        </section>

        <aside aria-label={t(lang, 'req.details')} className={`${panel} min-w-0 divide-y divide-line`}>
          {facts.length > 0 && (
            <dl className="space-y-3 p-5">
              {facts.map((f) => (
                <div key={f.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <dt className="text-sm text-ink-soft">{t(lang, f.key)}</dt>
                  <dd className="min-w-0 text-end font-medium [overflow-wrap:anywhere]">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <section aria-labelledby="shortlist-title" className="p-5">
            <h2 id="shortlist-title" className="text-sm font-semibold">{t(lang, 'req.shortlist')}</h2>
            {req.influencers.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">{t(lang, 'req.none')}</p>
            ) : (
              <ul className="-mx-2 mt-2">
                {req.influencers.map((i) => (
                  <li key={i.id}>
                    <Link href={`/influencers/${i.id}`} className="group flex min-h-11 items-center gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-surface-2">
                      <InfluencerPhoto id={i.id} name={i.name} photoAt={null} />
                      <span className="min-w-0 flex-1 truncate font-medium group-hover:underline group-hover:underline-offset-4"><bdi>{i.name}</bdi></span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ink-soft rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {req.files.length > 0 && (
            <section aria-labelledby="files-title" className="p-5">
              <h2 id="files-title" className="mb-2 text-sm font-semibold">{t(lang, 'req.files')}</h2>
              <FileList files={req.files} lang={lang} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The brief as written, with pasted http(s) addresses as links that open in a new tab. */
function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) => part.kind === 'text' ? part.text : (
        <a key={i} href={part.href} target="_blank" rel="noopener noreferrer"
          className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
          <bdi dir="ltr">{part.text}</bdi>
        </a>
      ))}
    </>
  );
}

/** Where the request stands: sent, proposal, the client's decision; and what happens next. */
function Progress({ status, lang }: { status: 'in_review' | 'proposal_ready' | 'accepted' | 'closed'; lang: 'en' | 'ar' }) {
  const reached = status === 'in_review' ? 1 : status === 'proposal_ready' ? 2 : 3;
  const steps = ['req.step.sent', 'req.step.proposal', 'req.step.decision'] as const;
  return (
    <div className="space-y-4">
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
      <p className={`text-[15px] leading-relaxed ${status === 'proposal_ready' ? 'font-medium text-accent' : 'text-ink'}`}>{t(lang, `req.next.${status}` as Key)}</p>
    </div>
  );
}
