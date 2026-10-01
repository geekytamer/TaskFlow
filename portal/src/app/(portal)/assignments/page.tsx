import { AssignmentActions } from '@/components/assignment-actions';
import { StatusBadge } from '@/components/status-badge';
import { WorkControls } from '@/components/work-controls';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAudience } from '@/lib/guard';
import { t } from '@/lib/i18n';
import { getAssignments } from '@/lib/influencer';
import { currentLang } from '@/lib/session';

const ORDER = { awaiting_reply: 0, confirmed: 1, completed: 2, declined: 3, cancelled: 3 } as const;

export default async function AssignmentsPage() {
  requireAudience('influencer');
  const lang = await currentLang();
  const assignments = (await getAssignments()).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const to = lang === 'ar' ? 'إلى' : 'to';

  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(lang, 'asg.title')}</h1>
        <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'asg.subtitle')}</p>
      </header>

      {assignments.length === 0 ? (
        <section className="border-t border-line pt-8">
          <h2 className="text-xl font-semibold tracking-tight">{t(lang, 'asg.emptyTitle')}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{t(lang, 'asg.emptyBody')}</p>
        </section>
      ) : (
        <ul className="space-y-6">
          {assignments.map((a) => (
            <li key={a.id} id={a.id} className={`space-y-5 rounded-xl border bg-surface p-5 md:p-6 ${a.status === 'awaiting_reply' ? 'border-accent/40' : 'border-line'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 dir="auto" className="text-xl font-semibold tracking-tight">{a.campaign.name}</h2>
                  {a.campaign.brand && <p dir="auto" className="mt-0.5 text-ink-soft">{a.campaign.brand}</p>}
                </div>
                <StatusBadge lang={lang} assignment={a.status} />
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                {(a.campaign.startDate || a.campaign.endDate) && (
                  <div>
                    <dt className="text-sm text-ink-soft">{t(lang, 'asg.dates')}</dt>
                    <dd className="font-medium"><bdi>{formatDate(a.campaign.startDate, lang)}</bdi> {to} <bdi>{formatDate(a.campaign.endDate, lang)}</bdi></dd>
                  </div>
                )}
                {a.agreedRate !== null && (
                  <div>
                    <dt className="text-sm text-ink-soft">{t(lang, 'asg.fee')}</dt>
                    <dd className="font-medium"><bdi>{formatMoney(a.agreedRate, a.currency, lang)}</bdi></dd>
                  </div>
                )}
              </dl>

              {a.deliverables.length > 0 && (
                <section aria-label={t(lang, 'asg.deliverables')}>
                  <h3 className="mb-2 text-sm font-semibold">{t(lang, 'asg.deliverables')}</h3>
                  <ul className="divide-y divide-line border-y border-line">
                    {a.deliverables.map((d) => (
                      <li key={d.id} id={`work-${d.id}`} className="space-y-1 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span dir="auto" className="font-medium">{d.title}</span>
                            {d.platform && <span className="ms-2 text-sm text-ink-soft"><bdi>{d.platform}</bdi></span>}
                          </span>
                          <span className="flex items-center gap-3 text-sm">
                            {d.dueDate && <span className="text-ink-soft">{t(lang, 'asg.due')} <bdi>{formatDate(d.dueDate, lang)}</bdi></span>}
                            <StatusBadge lang={lang} work={d.status} />
                          </span>
                        </div>
                        {d.brief && <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{d.brief}</p>}
                        {(a.status === 'confirmed' || a.status === 'completed') && (
                          <div className="pt-2"><WorkControls lang={lang} item={d} /></div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(a.status === 'confirmed' || a.status === 'completed') && (
                <section aria-label={t(lang, 'asg.brief')}>
                  <h3 className="mb-1 text-sm font-semibold">{t(lang, 'asg.brief')}</h3>
                  {a.brief
                    ? <p dir="auto" className="whitespace-pre-line leading-relaxed">{a.brief}</p>
                    : <p className="text-sm text-ink-soft">{t(lang, 'asg.noBrief')}</p>}
                </section>
              )}

              {a.status === 'awaiting_reply' && (
                <>
                  <p className="text-sm text-ink-soft">{t(lang, 'asg.briefAfter')}</p>
                  <AssignmentActions id={a.id} lang={lang} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
