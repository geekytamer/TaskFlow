import { AssignmentActions } from '@/components/assignment-actions';
import { PeakTag } from '@/components/deal-list';
import { BrandLink, OwnDealView } from '@/components/own-deal';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, Figure, PageHeader, SectionTitle } from '@/components/ui';
import { WorkControls } from '@/components/work-controls';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t, type Lang } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { getContacts, getDeal, getWorkspaceSettings, type PeakDeal } from '@/lib/workspace';

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const { id } = await params;
  const deal = await getDeal(id);
  const back = { href: '/deals', label: t(lang, 'deal.back') };
  if (!deal) {
    return (
      <div className="max-w-3xl space-y-8">
        <PageHeader title={t(lang, 'deal.notFoundTitle')} back={back} />
        <EmptyState title={t(lang, 'deal.notFoundTitle')} body={t(lang, 'deal.notFoundBody')} />
      </div>
    );
  }

  if (deal.source === 'peak') return <PeakDealPage deal={deal} lang={lang} back={back} />;

  const [contacts, settings] = await Promise.all([getContacts(), getWorkspaceSettings()]);
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        back={back}
        title={<bdi dir="auto">{deal.title}</bdi>}
        subtitle={deal.brand ? <BrandLink brand={deal.brand} /> : t(lang, 'deal.noBrand')}
      />
      <OwnDealView lang={lang} deal={deal} contacts={contacts} defaultCurrency={settings.defaultCurrency} />
    </div>
  );
}

function PeakDealPage({ deal, lang, back }: { deal: PeakDeal; lang: Lang; back: { href: string; label: string } }) {
  const a = deal.assignment;
  const briefed = a.status === 'confirmed' || a.status === 'completed';
  const to = lang === 'ar' ? 'إلى' : '–';
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        back={back}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{a.campaign.name}</bdi><PeakTag lang={lang} /></span>}
        subtitle={a.campaign.brand ? <bdi>{a.campaign.brand}</bdi> : undefined}
      />
      <p className="text-sm text-ink-soft">{t(lang, 'deal.peakNote')}</p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        {a.agreedRate !== null && <Figure label={t(lang, 'asg.fee')} value={<bdi className="tabular-nums">{formatMoney(a.agreedRate, a.currency, lang)}</bdi>} />}
        <Figure label={t(lang, 'deal.status')} value={<StatusBadge lang={lang} assignment={a.status} />} />
        {(a.campaign.startDate || a.campaign.endDate) && (
          <Figure label={t(lang, 'asg.dates')} value={<span className="text-base"><bdi>{formatDate(a.campaign.startDate, lang)}</bdi> {to} <bdi>{formatDate(a.campaign.endDate, lang)}</bdi></span>} />
        )}
      </dl>

      {a.status === 'awaiting_reply' && (
        <section className="space-y-3">
          <p className="text-sm text-ink-soft">{t(lang, 'asg.briefAfter')}</p>
          <AssignmentActions id={a.id} lang={lang} />
        </section>
      )}

      {briefed && (
        <section aria-labelledby="brief-title">
          <SectionTitle id="brief-title">{t(lang, 'asg.brief')}</SectionTitle>
          {a.brief ? <p dir="auto" className="max-w-prose whitespace-pre-line leading-relaxed">{a.brief}</p> : <p className="text-ink-soft">{t(lang, 'asg.noBrief')}</p>}
        </section>
      )}

      {a.deliverables.length > 0 && (
        <section aria-labelledby="work-title">
          <SectionTitle id="work-title">{t(lang, 'asg.deliverables')}</SectionTitle>
          <ul className="divide-y divide-line border-y border-line">
            {a.deliverables.map((d) => (
              <li key={d.id} id={`work-${d.id}`} className="scroll-mt-24 space-y-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span dir="auto" className="font-medium"><bdi>{d.title}</bdi></span>
                    {d.platform && <span className="ms-2 text-sm text-ink-soft"><bdi>{d.platform}</bdi></span>}
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    {d.dueDate && <span className="text-ink-soft">{t(lang, 'asg.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi></span>}
                    <StatusBadge lang={lang} work={d.status} />
                  </span>
                </div>
                {d.brief && <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{d.brief}</p>}
                {briefed && <div className="pt-1"><WorkControls lang={lang} item={d} /></div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
