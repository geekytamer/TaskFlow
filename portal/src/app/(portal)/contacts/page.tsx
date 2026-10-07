import { ContactForm } from '@/components/ws-contact';
import { EmptyState, PageHeader, RowLink, list } from '@/components/ui';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';
import { contactKindKey, getContacts, getDeals } from '@/lib/workspace';

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireAudience('influencer');
  const lang = await currentLang();
  const startOpen = (await searchParams).new === '1';
  const [contacts, deals] = await Promise.all([getContacts(), getDeals('own')]);
  const dealCount = new Map<string, number>();
  for (const d of deals) if (d.brand?.id) dealCount.set(d.brand.id, (dealCount.get(d.brand.id) ?? 0) + 1);
  const countLabel = (n: number) => (n === 1 ? t(lang, 'wsc.dealOne') : t(lang, 'wsc.dealCount').replace('{n}', String(n)));

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={t(lang, 'wsc.title')} subtitle={t(lang, 'wsc.subtitle')} />
      <ContactForm lang={lang} startOpen={startOpen || contacts.length === 0} />
      {contacts.length === 0 ? (
        <EmptyState title={t(lang, 'wsc.emptyTitle')} body={t(lang, 'wsc.emptyBody')} />
      ) : (
        <ul className={list}>
          {contacts.map((c) => {
            const n = dealCount.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <RowLink href={`/contacts/${c.id}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p dir="auto" className="truncate font-semibold"><bdi>{c.name}</bdi></p>
                      <p className="mt-0.5 truncate text-sm text-ink-soft">
                        {t(lang, contactKindKey(c.kind))}
                        {c.company && <><span aria-hidden="true"> · </span><bdi dir="auto">{c.company}</bdi></>}
                      </p>
                    </div>
                    {n > 0 && <span className="shrink-0 text-sm text-ink-soft"><bdi>{countLabel(n)}</bdi></span>}
                  </div>
                </RowLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
