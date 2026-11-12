'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useLiveRefresh } from '@/lib/live';
import { getWhatsappReport, type WhatsAppReport } from '@/services/whatsappService';
import { BarChart3, Loader2 } from 'lucide-react';

/** How the team answers on WhatsApp: speed and volume, per person and per day. */
export function WhatsappReportPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState<WhatsAppReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const companyId = selectedCompany?.id;

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setReport(await getWhatsappReport(companyId, days));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Error');
    }
  }, [companyId, days]);
  React.useEffect(() => {
    setReport(null);
    load();
  }, [load]);
  useLiveRefresh(['whatsapp'], load);

  const num = new Intl.NumberFormat(language === 'ar' ? 'ar' : 'en-US', { maximumFractionDigits: 1 });
  /** Working hours, said the way people say it: minutes under an hour. */
  const speed = (h: number | null) => {
    if (h === null) return '—';
    // Answered within the same minute, or entirely outside working hours.
    if (h < 1 / 60) return tr('under a minute', 'أقل من دقيقة');
    if (h < 1) return tr(`${num.format(Math.max(1, Math.round(h * 60)))} min`, `${num.format(Math.max(1, Math.round(h * 60)))} دقيقة`);
    return tr(`${num.format(h)} h`, `${num.format(h)} ساعة`);
  };
  const dayFmt = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-US', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="h-5 w-5" />
            {tr('WhatsApp response report', 'تقرير الردود على واتساب')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr('Reply times count working hours only (Settings → Inbox response times).', 'أوقات الرد تحسب ساعات الدوام فقط (الإعدادات ← أوقات الرد).')}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={tr('Period', 'الفترة')}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm ${days === d ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              {tr(`${d} days`, `${num.format(d)} يوماً`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!report ? (
        !error && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              [tr('Typical first reply', 'متوسط أول رد'), speed(report.totals.medianReplyHours), tr('median', 'الوسيط')],
              [tr('Customer messages', 'رسائل العملاء'), num.format(report.totals.inbound), tr(`${num.format(report.totals.newChats)} new chats`, `${num.format(report.totals.newChats)} محادثة جديدة`)],
              [tr('Answered waits', 'انتظارات أُجيبت'), num.format(report.totals.answered), tr(`${num.format(report.totals.unanswered)} still unanswered`, `${num.format(report.totals.unanswered)} بلا رد بعد`)],
              [tr('Open now', 'مفتوحة الآن'), num.format(report.totals.openNow), tr(`${num.format(report.totals.lateNow)} late`, `${num.format(report.totals.lateNow)} متأخرة`)],
            ] as const).map(([label, value, sub]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </div>
            ))}
          </div>

          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-semibold">{tr('Messages per day', 'الرسائل يومياً')}</h2>
            {(() => {
              const max = Math.max(1, ...report.days.map((d) => Math.max(d.inbound, d.outbound)));
              return (
                <div className="flex h-36 items-end gap-0.5" role="img" aria-label={tr('Customer messages and replies per day', 'رسائل العملاء والردود يومياً')}>
                  {report.days.map((d) => (
                    <div key={d.day} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${dayFmt.format(new Date(d.day))}: ${d.inbound} / ${d.outbound}`}>
                      <div className="flex-1 rounded-t-sm bg-emerald-500/80" style={{ height: `${(d.inbound / max) * 100}%` }} />
                      <div className="flex-1 rounded-t-sm bg-sky-500/70" style={{ height: `${(d.outbound / max) * 100}%` }} />
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/80" />{tr('From customers', 'من العملاء')}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500/70" />{tr('From us', 'منّا')}</span>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">{tr('Person', 'الموظف')}</th>
                  <th className="px-3 py-2 text-start font-medium">{tr('Typical first reply', 'متوسط أول رد')}</th>
                  <th className="px-3 py-2 text-start font-medium">{tr('Waits answered', 'انتظارات أجاب عليها')}</th>
                  <th className="px-3 py-2 text-start font-medium">{tr('Messages sent', 'رسائل أرسلها')}</th>
                  <th className="px-3 py-2 text-start font-medium">{tr('Open / late now', 'مفتوحة / متأخرة الآن')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.people.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{tr('No replies in this period.', 'لا ردود في هذه الفترة.')}</td>
                  </tr>
                )}
                {report.people.map((p) => (
                  <tr key={p.userId}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums">{speed(p.medianReplyHours)}</td>
                    <td className="px-3 py-2 tabular-nums">{num.format(p.answered)}</td>
                    <td className="px-3 py-2 tabular-nums">{num.format(p.messagesSent)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {num.format(p.openAssigned)}
                      {p.lateAssigned > 0 && <span className="ms-1 text-red-600 dark:text-red-400">/ {num.format(p.lateAssigned)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
