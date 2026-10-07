import Link from 'next/link';
import { DealGroup } from '@/components/deal-list';
import { ContactDetails, ContactNotes } from '@/components/ws-contact';
import { EmptyState, PageHeader, SectionTitle, button } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { contactKindKey, dealSort, getContact } from '@/lib/workspace';

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const contact = await getContact((await params).id);
  const back = { href: '/contacts', label: t(lang, 'wsc.back') };
  if (!contact) {
    return (
      <div className="max-w-3xl space-y-8">
        <PageHeader title={t(lang, 'deal.notFoundTitle')} back={back} />
        <EmptyState title={t(lang, 'deal.notFoundTitle')} body={t(lang, 'deal.notFoundBody')} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader
        back={back}
        title={<bdi dir="auto">{contact.name}</bdi>}
        subtitle={
          <>
            {t(lang, contactKindKey(contact.kind))}
            {contact.company && <><span aria-hidden="true"> · </span><bdi dir="auto">{contact.company}</bdi></>}
            {contact.archived && <><span aria-hidden="true"> · </span>{t(lang, 'wsc.archived')}</>}
          </>
        }
        actions={!contact.archived && <Link href={`/deals/new?contact=${contact.id}`} className={button.primary}>{t(lang, 'wsc.newDeal')}</Link>}
      />

      <section aria-labelledby="details-title">
        <SectionTitle id="details-title">{t(lang, 'wsc.details')}</SectionTitle>
        <ContactDetails lang={lang} contact={contact} />
      </section>

      {contact.deals.length > 0
        ? <DealGroup title={t(lang, 'wsc.deals')} deals={dealSort(contact.deals)} lang={lang} />
        : (
          <section>
            <SectionTitle>{t(lang, 'wsc.deals')}</SectionTitle>
            <p className="text-ink-soft">{t(lang, 'wsc.noDeals')}</p>
          </section>
        )}

      <section aria-labelledby="log-title">
        <SectionTitle id="log-title">{t(lang, 'wsc.log')}</SectionTitle>
        <ContactNotes lang={lang} contactId={contact.id} log={contact.log} />
      </section>
    </div>
  );
}
