import { notFound } from 'next/navigation';
import { ProposalActions } from '@/components/proposal-actions';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getProposal } from '@/lib/requests';
import { currentLang } from '@/lib/session';
import { PageHeader, panel } from '@/components/ui';

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('client');
  const { id } = await params;
  const lang = await currentLang();
  const proposal = await getProposal(id);
  if (!proposal) notFound();
  const money = (value: number) => formatMoney(value, proposal.currency, lang);

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: '/requests', label: t(lang, 'req.back') }}
        title={<span className="inline-flex flex-wrap items-center gap-3"><bdi>{proposal.title}</bdi><StatusBadge lang={lang} proposal={proposal.status} /></span>}
        subtitle={<>{t(lang, 'prop.title')} <bdi dir="ltr">{proposal.number}</bdi></>}
      />
      <header>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="inline text-ink-soft">{t(lang, 'prop.issued')}: </dt><dd className="inline font-medium"><bdi>{formatDate(proposal.issueDate, lang)}</bdi></dd></div>
          {proposal.validUntil && (
            <div><dt className="inline text-ink-soft">{t(lang, 'prop.validUntil')}: </dt><dd className="inline font-medium"><bdi>{formatDate(proposal.validUntil, lang)}</bdi></dd></div>
          )}
          {proposal.respondedBy && (
            <div><dt className="inline text-ink-soft">{t(lang, 'prop.answeredBy')}: </dt><dd className="inline font-medium">{proposal.respondedBy}, <bdi>{formatDate(proposal.respondedAt, lang)}</bdi></dd></div>
          )}
        </dl>
      </header>

      <section className="space-y-4">
        <div className={`${panel} flex flex-wrap items-baseline justify-between gap-3 p-5`}>
          <span className="text-sm text-ink-soft">{t(lang, 'prop.total')}</span>
          <span className="text-[28px] font-semibold leading-none tracking-tight"><bdi dir="ltr">{money(proposal.total)}</bdi></span>
        </div>
        {/* Phones: one stacked row per line, so no amount is scrolled out of view. */}
        <ul className={`${panel} divide-y divide-line px-4 sm:hidden`}>
          {proposal.items.map((item, index) => (
            <li key={index} className="py-3 text-sm">
              <p className="font-medium"><bdi>{item.description}</bdi></p>
              <p className="mt-1 flex justify-between gap-4 text-ink-soft">
                <span><bdi>{item.quantity}</bdi> × <bdi dir="ltr">{money(item.unitPrice)}</bdi></span>
                <span className="font-semibold text-ink"><bdi dir="ltr">{money(item.lineTotal)}</bdi></span>
              </p>
            </li>
          ))}
        </ul>
        <div className={`${panel} hidden overflow-x-auto px-5 sm:block`}>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-3 pe-4 text-start font-medium">{t(lang, 'prop.item')}</th>
                <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'prop.qty')}</th>
                <th scope="col" className="py-3 pe-4 text-end font-medium">{t(lang, 'prop.unitPrice')}</th>
                <th scope="col" className="py-3 text-end font-medium">{t(lang, 'prop.lineTotal')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {proposal.items.map((item, index) => (
                <tr key={index}>
                  <td dir="auto" className="py-3 pe-4 text-start">{item.description}</td>
                  <td className="py-3 pe-4 text-end tabular-nums">{item.quantity}</td>
                  <td className="py-3 pe-4 text-end tabular-nums"><bdi dir="ltr">{money(item.unitPrice)}</bdi></td>
                  <td className="py-3 text-end tabular-nums"><bdi dir="ltr">{money(item.lineTotal)}</bdi></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <th scope="row" colSpan={3} className="py-4 pe-4 text-end font-semibold">{t(lang, 'prop.total')}</th>
                <td className="py-4 text-end text-base font-semibold tabular-nums"><bdi dir="ltr">{money(proposal.total)}</bdi></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {proposal.status === 'sent' && <ProposalActions lang={lang} proposalId={proposal.id} totalLabel={money(proposal.total)} />}
      {proposal.status === 'expired' && <p className="text-ink-soft">{t(lang, 'prop.expiredNote')}</p>}
    </div>
  );
}
