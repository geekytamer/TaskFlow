'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { approverRoleLabel } from '@/modules/settings/components/approval-rules-panel';
import { decideApproval, getWaitingApprovals, type WaitingApproval } from '@/services/approvalService';

/** What is waiting for the signed-in person's sign-off, oldest first. */
export function ApprovalsPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { money } = useCompanyCurrency();
  const { toast } = useToast();
  const [items, setItems] = React.useState<WaitingApproval[] | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    try { setItems((await getWaitingApprovals(selectedCompany.id)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))); }
    catch (error: any) { setItems([]); toast({ variant: 'destructive', title: tr('Could not load approvals', 'تعذّر تحميل الموافقات'), description: error?.message }); }
  }, [selectedCompany, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (w: WaitingApproval, decision: 'approve' | 'reject') => {
    const key = `${w.docType}:${w.docId}`;
    if (decision === 'reject' && !notes[key]?.trim()) {
      toast({ variant: 'destructive', title: tr('Say why it is rejected', 'اذكر سبب الرفض') });
      return;
    }
    setBusy(key);
    try {
      await decideApproval(w.docType, w.docId, decision, notes[key]);
      toast({ title: decision === 'approve' ? tr('Approved', 'تمت الموافقة') : tr('Rejected', 'تم الرفض') });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not record the decision', 'تعذّر تسجيل القرار'), description: error?.message });
    } finally { setBusy(null); }
  };

  return (
    <SectionPageShell title={tr('Approvals', 'الموافقات')} description={tr('Purchase orders and expenses waiting for your sign-off. Rules are set in Settings.', 'أوامر الشراء والمصروفات التي تنتظر موافقتك. تُضبط القواعد في الإعدادات.')}>
      {items === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600" />{tr('Nothing is waiting for you.', 'لا شيء ينتظرك.')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((w) => {
            const key = `${w.docType}:${w.docId}`;
            return (
              <li key={key} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ClipboardCheck className="h-4 w-4 self-center text-muted-foreground" />
                  <span className="font-semibold" dir="auto">{w.docType === 'purchase_order' ? tr(`Purchase order ${w.number}`, `أمر الشراء ${w.number}`) : tr(`Expense: ${w.number}`, `مصروف: ${w.number}`)}</span>
                  <span className="text-lg font-semibold tabular-nums">{money(w.amount)}</span>
                  {w.party && <span className="text-sm text-muted-foreground" dir="auto">{w.party}</span>}
                  <span className="text-xs text-muted-foreground">{format(new Date(w.date), 'dd MMM yyyy')}</span>
                  <span className="ms-auto text-xs text-muted-foreground">{tr(`Level ${w.level} of ${w.levels}: ${approverRoleLabel(w.approverRole, tr)}`, `المستوى ${w.level} من ${w.levels}: ${approverRoleLabel(w.approverRole, tr)}`)}</span>
                </div>
                {w.canDecide ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input className="min-w-48 flex-1" placeholder={tr('Note (needed to reject)', 'ملاحظة (مطلوبة للرفض)')} aria-label={tr('Note', 'ملاحظة')} value={notes[key] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))} />
                    <Button variant="outline" disabled={busy === key} onClick={() => act(w, 'reject')}>{tr('Reject', 'رفض')}</Button>
                    <Button disabled={busy === key} onClick={() => act(w, 'approve')}>{tr('Approve', 'موافقة')}</Button>
                    <Button variant="link" asChild><Link href={w.docType === 'purchase_order' ? '/purchases' : '/finance?tab=expenses'}>{tr('Open', 'فتح')}</Link></Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">{tr('You approved an earlier level; another person must approve this one.', 'وافقت على مستوى سابق؛ يجب أن يوافق شخص آخر على هذا المستوى.')}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionPageShell>
  );
}
