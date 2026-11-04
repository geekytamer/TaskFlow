'use client';

/**
 * Finance → Intercompany (spec 2026-11-04-intercompany-design): what this
 * company and each sister say they owe each other, the documents behind a
 * difference, and the other side's payments waiting to be recorded here.
 */
import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useCan } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { useCurrencyOf } from '@/modules/groups/hooks/use-currency-of';
import { getIntercompany, matchPayment, setUpPartner, type ExplainItem, type IntercompanyView, type ToMatch } from '@/services/intercompanyService';

export function IntercompanyPanel() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const currencyOf = useCurrencyOf();
  const canSetUp = useCan('contacts.manage');
  const canReceive = useCan('invoices.pay');
  const canPay = useCan('vendor-bills.pay');
  const [view, setView] = React.useState<IntercompanyView | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setView(await getIntercompany(companyId));
      setFailed(null);
    } catch (error) {
      setFailed((error as Error).message);
    }
  }, [companyId]);
  React.useEffect(() => { setView(null); void load(); }, [load]);

  const nameOf = (id: string) => (id === companyId ? selectedCompany?.name : view?.sisters.find((s) => s.id === id)?.name) ?? tr('a group company', 'شركة في المجموعة');

  const setUp = async (sisterId: string, kind: 'client' | 'supplier') => {
    setBusy(`${kind}:${sisterId}`);
    try {
      await setUpPartner(companyId, sisterId, kind);
      toast({ title: kind === 'client' ? tr('Ready to invoice', 'جاهزة للفوترة') : tr('Ready to buy from', 'جاهزة للشراء منها'), description: tr('It is now in the client and supplier lists, marked as a group company.', 'أصبحت في قوائم العملاء والموردين كشركة في المجموعة.') });
      await load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Not set up', 'لم يتم الإعداد'), description: (error as Error).message });
    } finally { setBusy(null); }
  };

  const match = async (item: ToMatch) => {
    setBusy(item.paymentId);
    try {
      const result = await matchPayment(companyId, item);
      toast(result.hold
        ? { title: tr('Sent for approval', 'أُرسل للموافقة'), description: tr('Payments need approval here; it is recorded once approved.', 'المدفوعات تحتاج موافقة هنا؛ تُسجَّل بعد الموافقة.') }
        : result.linked
          ? { title: tr('Linked to the payment already recorded here', 'رُبطت بالدفعة المسجلة هنا مسبقًا') }
          : { title: item.kind === 'bill_payment' ? tr('Receipt recorded', 'تم تسجيل التحصيل') : tr('Payment recorded', 'تم تسجيل الدفعة') });
      await load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Not recorded', 'لم يُسجَّل'), description: (error as Error).message });
    } finally { setBusy(null); }
  };

  const explainText = (e: ExplainItem) => {
    const amount = formatCurrency(Math.abs(e.amount), e.currency);
    if (e.kind === 'credit_note') return tr(`${nameOf(e.companyId)} credited ${amount} on ${e.number}; the other side has nothing to match it`, `أصدرت ${nameOf(e.companyId)} إشعارًا دائنًا بـ ${amount} على ${e.number}؛ ولا يقابله شيء لدى الطرف الآخر`);
    if (e.kind === 'amount_mismatch') return tr(`The bill for ${e.number} differs from the invoice by ${amount}`, `فاتورة المورد لـ ${e.number} تختلف عن الفاتورة بـ ${amount}`);
    if (e.kind === 'unmirrored_invoice') return tr(`${nameOf(e.companyId)} invoice ${e.number} (${amount}) has no matching bill yet`, `فاتورة ${nameOf(e.companyId)} رقم ${e.number} (${amount}) بلا فاتورة مورد مقابلة بعد`);
    if (e.kind === 'draft_bill') return tr(`${nameOf(e.companyId)} has not approved the bill for ${e.number} (${amount})`, `${nameOf(e.companyId)} لم تعتمد فاتورة المورد لـ ${e.number} (${amount})`);
    return tr(`${nameOf(e.companyId)} recorded ${amount} on ${e.number}; the other side has not`, `${nameOf(e.companyId)} سجّلت ${amount} على ${e.number}؛ ولم يسجّلها الطرف الآخر`);
  };

  if (failed) return <p className="text-sm text-destructive" role="alert">{failed}</p>;
  if (!view) return <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
  if (!view.sisters.length) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {tr('This company is not in a group. Intercompany trading starts once it sits under or above another company.', 'هذه الشركة ليست ضمن مجموعة. يبدأ التعامل بين الشركات عندما تكون تحت شركة أخرى أو فوقها.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {tr('Invoice a group company and it gets the matching bill as a draft; order from one and it gets the sales order. Both post to Due from / Due to group companies, so the two sides can be compared here.',
          'عند فوترة شركة في المجموعة تصلها فاتورة مورد مقابلة كمسودة، وعند الطلب منها يصلها أمر بيع. يُرحَّل الطرفان إلى حسابَي المستحق من / إلى شركات المجموعة، لذا تمكن مقارنتهما هنا.')}
      </p>

      {view.toMatch.length > 0 && (
        <section className="space-y-2" aria-labelledby="ic-match">
          <h3 id="ic-match" className="text-sm font-semibold">{tr('To match', 'بانتظار المطابقة')} <Badge variant="secondary" className="ms-1">{view.toMatch.length}</Badge></h3>
          <ul className="space-y-2">
            {view.toMatch.map((m) => {
              const seller = m.kind === 'bill_payment';
              const allowed = seller ? canReceive : canPay;
              const draft = !seller && m.targetStatus === 'Draft';
              return (
                <li key={m.paymentId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span dir="auto" className="min-w-0 flex-1">
                    {seller
                      ? tr(`${nameOf(m.fromCompanyId)} paid ${formatCurrency(m.amount, m.currency)} on its bill for ${m.targetNumber}`, `دفعت ${nameOf(m.fromCompanyId)} ${formatCurrency(m.amount, m.currency)} على فاتورة المورد لـ ${m.targetNumber}`)
                      : tr(`${nameOf(m.fromCompanyId)} received ${formatCurrency(m.amount, m.currency)} on invoice ${m.fromDocument}`, `استلمت ${nameOf(m.fromCompanyId)} ${formatCurrency(m.amount, m.currency)} على الفاتورة ${m.fromDocument}`)}
                    <span className="ms-2 text-xs text-muted-foreground">{format(new Date(m.paidAt), 'dd MMM yyyy')}</span>
                    {draft && <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">{tr(`Approve bill ${m.targetNumber} first.`, `اعتمد فاتورة المورد ${m.targetNumber} أولًا.`)}</span>}
                  </span>
                  <Button size="sm" disabled={!allowed || draft || busy === m.paymentId} onClick={() => void match(m)}>
                    {seller ? tr(`Record receipt on ${m.targetNumber}`, `تسجيل التحصيل على ${m.targetNumber}`) : tr(`Record payment on ${m.targetNumber}`, `تسجيل الدفعة على ${m.targetNumber}`)}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="ic-balances">
        <h3 id="ic-balances" className="text-sm font-semibold">{tr('Balances with group companies', 'الأرصدة مع شركات المجموعة')}</h3>
        <ul className="space-y-2">
          {view.sisters.map((s) => {
            const b = view.balances.find((x) => x.sisterId === s.id);
            const currency = b?.currency ?? currencyOf(companyId);
            const agrees = b?.difference === 0;
            return (
              <li key={s.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-semibold" dir="auto">{s.name}</span>
                  {b && (
                    <>
                      <span className="text-sm tabular-nums">
                        {b.ours >= 0 ? tr('owes us', 'مدينة لنا بـ') : tr('we owe', 'ندين لها بـ')} {formatCurrency(Math.abs(b.ours), currency)}
                      </span>
                      {b.difference === null ? (
                        <span className="text-xs text-muted-foreground">{b.theirs >= 0
                          ? tr(`Its books (${b.theirCurrency}) say it owes ${formatCurrency(b.theirs, b.theirCurrency)}.`, `دفاترها (${b.theirCurrency}) تقول إنها مدينة بـ ${formatCurrency(b.theirs, b.theirCurrency)}.`)
                          : tr(`Its books (${b.theirCurrency}) say we owe it ${formatCurrency(-b.theirs, b.theirCurrency)}.`, `دفاترها (${b.theirCurrency}) تقول إننا مدينون لها بـ ${formatCurrency(-b.theirs, b.theirCurrency)}.`)}</span>
                      ) : agrees ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{tr('Both sides agree', 'الطرفان متفقان')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{b.theirs >= 0
                          ? tr(`Its books say it owes ${formatCurrency(b.theirs, currency)} · difference ${formatCurrency(Math.abs(b.difference), currency)}`, `دفاترها تقول إنها مدينة بـ ${formatCurrency(b.theirs, currency)} · الفرق ${formatCurrency(Math.abs(b.difference), currency)}`)
                          : tr(`Its books say we owe it ${formatCurrency(-b.theirs, currency)} · difference ${formatCurrency(Math.abs(b.difference), currency)}`, `دفاترها تقول إننا مدينون لها بـ ${formatCurrency(-b.theirs, currency)} · الفرق ${formatCurrency(Math.abs(b.difference), currency)}`)}</span>
                      )}
                    </>
                  )}
                  <span className="ms-auto flex flex-wrap gap-2">
                    {!s.clientId && canSetUp && <Button size="sm" variant="outline" disabled={busy === `client:${s.id}`} onClick={() => void setUp(s.id, 'client')}>{tr('Invoice it', 'فوترتها')}</Button>}
                    {!s.supplierId && canSetUp && <Button size="sm" variant="outline" disabled={busy === `supplier:${s.id}`} onClick={() => void setUp(s.id, 'supplier')}>{tr('Buy from it', 'الشراء منها')}</Button>}
                  </span>
                </div>
                {b && b.explain.length > 0 && b.difference !== 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {b.explain.map((e) => <li key={`${e.kind}:${e.documentId}`} dir="auto">· {explainText(e)}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
