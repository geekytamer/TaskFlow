'use client';

/**
 * Approvals: what waits for my decision, what I asked for, and what I
 * decided. Each item shows the document, its amount in its own currency, the
 * step it is at and who is on it. In a group shown whole, every company's.
 */
import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { fanOut, type MissingCompany } from '@/lib/fan-out';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { CompanyLabel } from '@/modules/groups/components/company-cell';
import { MissingCompanies } from '@/modules/groups/components/missing-companies';
import { useCurrencyOf } from '@/modules/groups/hooks/use-currency-of';
import {
  decideApproval, docLink, docTypeLabel, getApprovals, type ApprovalBox, type ApprovalItem,
} from '@/services/approvalService';
import { DelegationCard } from './delegation-card';

export function ApprovalsPage() {
  const { selectedCompany } = useCompany();
  const { companyIds } = useCompanyScope();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const currencyOf = useCurrencyOf();
  const [box, setBox] = React.useState<ApprovalBox>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('box') === 'mine' ? 'mine' : 'waiting');
  const [items, setItems] = React.useState<ApprovalItem[] | null>(null);
  const [missing, setMissing] = React.useState<MissingCompany[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const scopeKey = companyIds.join(',');
  const ticket = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!selectedCompany || !scopeKey) return;
    const mine = ++ticket.current;
    const answer = await fanOut(scopeKey.split(','), (id) => getApprovals(id, box));
    if (mine !== ticket.current) return;
    setItems(answer.rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)));
    setMissing(answer.missing);
  }, [selectedCompany, scopeKey, box]);
  React.useEffect(() => { setItems(null); void load(); }, [load]);

  const act = async (w: ApprovalItem, decision: 'approve' | 'reject' | 'send_back') => {
    const key = `${w.docType}:${w.docId}`;
    if (decision !== 'approve' && !notes[key]?.trim()) {
      toast({ variant: 'destructive', title: decision === 'reject' ? tr('Say why it is rejected', 'اذكر سبب الرفض') : tr('Say what needs changing', 'اذكر ما يحتاج إلى تغيير') });
      return;
    }
    setBusy(key);
    try {
      await decideApproval(w.docType, w.docId, decision, notes[key]);
      toast({ title: decision === 'approve' ? tr('Approved', 'تمت الموافقة') : decision === 'reject' ? tr('Rejected', 'تم الرفض') : tr('Sent back for changes', 'أُعيد للتعديل') });
      await load();
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Could not record the decision', 'تعذّر تسجيل القرار'), description: (error as Error).message });
    } finally { setBusy(null); }
  };

  const statusChip = (w: ApprovalItem) => {
    const map: Record<string, [string, string]> = {
      pending: [tr('Waiting', 'قيد الانتظار'), 'text-amber-600 dark:text-amber-400'],
      approved: [tr('Approved', 'معتمد'), 'text-emerald-600 dark:text-emerald-400'],
      rejected: [tr('Rejected', 'مرفوض'), 'text-destructive'],
      changes_requested: [tr('Changes requested', 'مطلوب تعديل'), 'text-orange-600 dark:text-orange-400'],
      not_required: [tr('No approval needed', 'لا يحتاج موافقة'), 'text-muted-foreground'],
    };
    const [label, cls] = map[w.status] ?? map.pending;
    return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
  };

  return (
    <SectionPageShell
      title={tr('Approvals', 'الموافقات')}
      description={tr('What waits for your decision, what you asked for, and what you decided. Policies are set in Settings → Approvals.', 'ما ينتظر قرارك، وما طلبته، وما قررته. تُضبط السياسات في الإعدادات ← الموافقات.')}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <Tabs value={box} onValueChange={(v) => setBox(v as ApprovalBox)}>
          <TabsList>
            <TabsTrigger value="waiting">{tr('Waiting for me', 'بانتظاري')}</TabsTrigger>
            <TabsTrigger value="mine">{tr('My requests', 'طلباتي')}</TabsTrigger>
            <TabsTrigger value="decided">{tr('Decided', 'ما قررته')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <DelegationCard />
      </div>
      <MissingCompanies missing={missing} />
      {items === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          {box === 'waiting' ? tr('Nothing is waiting for you.', 'لا شيء ينتظرك.') : tr('Nothing here yet.', 'لا شيء هنا بعد.')}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((w) => {
            const key = `${w.docType}:${w.docId}`;
            const current = w.steps.find((s) => s.status === 'pending');
            return (
              <li key={key} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ClipboardCheck className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />
                  <span className="font-semibold" dir="auto">{docTypeLabel(w.docType, tr)} {w.number}</span>
                  {w.amount > 0 && <span className="text-lg font-semibold tabular-nums">{formatCurrency(w.amount, currencyOf(w.companyId))}</span>}
                  {w.party && <span className="text-sm text-muted-foreground" dir="auto">{w.party}</span>}
                  <span className="text-xs text-muted-foreground">{format(new Date(w.date), 'dd MMM yyyy')}</span>
                  {statusChip(w)}
                  <CompanyLabel companyId={w.companyId} className="text-xs text-muted-foreground" />
                </div>

                {/* The steps, in order: who is on each and where it stands. */}
                <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {w.steps.map((s) => (
                    <li key={s.level} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${s === current ? 'border-amber-500/60 bg-amber-500/10' : ''}`}>
                      {s.status === 'approved' ? <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                        : s.status === 'rejected' ? <XCircle className="h-3 w-3 text-destructive" aria-hidden="true" />
                        : <CircleDashed className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                      <span>{s.approvers.map((a) => a.label).join(s.need === 'all' ? tr(' and ', ' و') : tr(' or ', ' أو '))}</span>
                      {s.decidedByName && <span className="text-muted-foreground">· {s.decidedByName}</span>}
                      {s.stuck && (
                        <span className="inline-flex items-center gap-0.5 text-destructive" title={tr('Nobody who works in this company can decide this step. Change who decides in Settings → Approvals.', 'لا يوجد في هذه الشركة من يستطيع البت في هذه الخطوة. غيّر من يقرر في الإعدادات ← الموافقات.')}>
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />{tr('nobody to decide', 'لا أحد للبت')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {w.steps.find((s) => s.note) && (
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">“{w.steps.filter((s) => s.note).map((s) => s.note).join(' · ')}”</p>
                )}

                {w.canDecide && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {w.onBehalfOf && <span className="text-xs text-muted-foreground">{tr('You are standing in for a colleague.', 'أنت تنوب عن زميل.')}</span>}
                    <Input className="min-w-48 flex-1" placeholder={tr('Note (needed to reject or send back)', 'ملاحظة (مطلوبة للرفض أو الإعادة)')} aria-label={tr('Note', 'ملاحظة')} value={notes[key] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))} />
                    <Button variant="outline" disabled={busy === key} onClick={() => act(w, 'reject')}>{tr('Reject', 'رفض')}</Button>
                    <Button variant="outline" disabled={busy === key} onClick={() => act(w, 'send_back')}>{tr('Send back', 'إعادة للتعديل')}</Button>
                    <Button disabled={busy === key} onClick={() => act(w, 'approve')}>{tr('Approve', 'موافقة')}</Button>
                  </div>
                )}
                <div className="mt-1">
                  <Button variant="link" className="h-auto p-0 text-xs" asChild><Link href={docLink(w.docType)}>{tr('Open', 'فتح')}</Link></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionPageShell>
  );
}
