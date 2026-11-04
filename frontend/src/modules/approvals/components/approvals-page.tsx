'use client';

/**
 * Approvals: what waits for my decision, what I asked for, and what I
 * decided. Each item shows the document, its amount in its own currency, the
 * step it is at and who is on it. In a group shown whole, every company's.
 */
import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ClipboardCheck, XCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useCan } from '@/context/permissions-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';
import { fanOut, type MissingCompany } from '@/lib/fan-out';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { CompanyLabel } from '@/modules/groups/components/company-cell';
import { MissingCompanies } from '@/modules/groups/components/missing-companies';
import { useCurrencyOf } from '@/modules/groups/hooks/use-currency-of';
import {
  amountIsDays, decideApproval, docLink, docTypeLabel, getApprovals, type ApprovalBox, type ApprovalItem,
} from '@/services/approvalService';
import { approveEach, totalsByCurrency } from '../lib/bulk';
import { approverText } from '../lib/wording';
import { ApprovalPanel } from './approval-panel';
import { DelegationCard } from './delegation-card';

export function ApprovalsPage() {
  const { selectedCompany } = useCompany();
  const { companyIds, companyName } = useCompanyScope();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const currencyOf = useCurrencyOf();
  const canManage = useCan('settings.manage_approvals');
  const [box, setBox] = React.useState<ApprovalBox>(() => {
    const asked = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('box') : null;
    return asked === 'mine' || asked === 'decided' || asked === 'open' ? asked : 'waiting';
  });
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ApprovalItem[] | null>(null);
  const [missing, setMissing] = React.useState<MissingCompany[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  // Bulk approve (Waiting for me only): what is ticked, the confirmation, progress, and why some failed.
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [failures, setFailures] = React.useState<Record<string, string>>({});
  const scopeKey = companyIds.join(',');
  const ticket = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!selectedCompany || !scopeKey) return;
    const mine = ++ticket.current;
    const answer = await fanOut(scopeKey.split(','), (id) => getApprovals(id, box));
    if (mine !== ticket.current) return;
    // A child's document waiting at the group's sign-off is in both inboxes: list it once.
    const seen = new Set<string>();
    const unique = answer.rows.filter((w) => { const k = `${w.docType}:${w.docId}`; if (seen.has(k)) return false; seen.add(k); return true; });
    // Oldest first; in All open, the stuck ones (nobody can decide them) come first.
    const stuck = (w: ApprovalItem) => (box === 'open' && w.steps.some((s) => s.stuck) ? 0 : 1);
    setItems(unique.sort((a, b) => stuck(a) - stuck(b) || Date.parse(a.date) - Date.parse(b.date)));
    setMissing(answer.missing);
  }, [selectedCompany, scopeKey, box]);
  React.useEffect(() => { setItems(null); setPicked(new Set()); setFailures({}); void load(); }, [load]);

  const keyOf = (w: ApprovalItem) => `${w.docType}:${w.docId}`;
  const pickable = box === 'waiting' ? (items ?? []).filter((w) => w.canDecide) : [];
  const chosen = pickable.filter((w) => picked.has(keyOf(w)));
  const totals = totalsByCurrency(chosen.map((w) => ({ amount: w.amount, currency: currencyOf(w.companyId), days: amountIsDays(w.docType) })));
  const totalsText = [
    ...Object.entries(totals.money).map(([c, n]) => formatCurrency(n, c)),
    ...(totals.days ? [tr(`${totals.days} day${totals.days === 1 ? '' : 's'} of leave`, `${totals.days} يوم إجازة`)] : []),
  ].join(' · ');
  const toggle = (w: ApprovalItem) => setPicked((p) => { const n = new Set(p); if (n.has(keyOf(w))) n.delete(keyOf(w)); else n.add(keyOf(w)); return n; });
  const allPicked = pickable.length > 0 && chosen.length === pickable.length;

  const approveChosen = async () => {
    setConfirming(false);
    setFailures({});
    setProgress(0);
    const result = await approveEach(chosen, (w) => decideApproval(w.docType, w.docId, 'approve'), setProgress);
    setProgress(null);
    const failed = Object.fromEntries(result.failed.map((f) => [keyOf(f.item), f.message]));
    setFailures(failed);
    setPicked(new Set(Object.keys(failed)));
    toast(result.failed.length
      ? { variant: 'destructive', title: tr(`Approved ${result.done.length}, ${result.failed.length} not approved`, `تمت الموافقة على ${result.done.length}، ولم تتم على ${result.failed.length}`), description: tr('The reason is shown on each one still ticked.', 'السبب ظاهر على كل عنصر ما زال محددًا.') }
      : { title: tr(`Approved ${result.done.length}`, `تمت الموافقة على ${result.done.length}`) });
    await load();
  };

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
            {canManage && <TabsTrigger value="open">{tr('All open', 'كل المفتوح')}</TabsTrigger>}
          </TabsList>
        </Tabs>
        <DelegationCard />
      </div>
      <MissingCompanies missing={missing} />
      {items === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          {box === 'waiting' ? tr('Nothing is waiting for you.', 'لا شيء ينتظرك.') : box === 'open' ? tr('Nothing is waiting for approval in this company.', 'لا شيء بانتظار الموافقة في هذه الشركة.') : tr('Nothing here yet.', 'لا شيء هنا بعد.')}
        </div>
      ) : (
        <>
        {pickable.length > 1 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 p-3 backdrop-blur">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allPicked ? true : chosen.length ? 'indeterminate' : false}
                onCheckedChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map(keyOf)))}
                aria-label={tr('Select all', 'تحديد الكل')}
              />
              {chosen.length ? tr(`${chosen.length} selected`, `${chosen.length} محدد`) : tr('Select to approve several at once', 'حدد للموافقة على عدة عناصر معًا')}
            </label>
            {totalsText && <span className="text-sm font-medium tabular-nums">{totalsText}</span>}
            <Button className="ms-auto" disabled={!chosen.length || progress !== null} onClick={() => setConfirming(true)}>
              {progress !== null ? tr(`Approving ${progress} of ${chosen.length}…`, `جارٍ الموافقة ${progress} من ${chosen.length}…`) : tr(`Approve ${chosen.length || ''}`.trim(), `موافقة ${chosen.length || ''}`.trim())}
            </Button>
          </div>
        )}
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr(`Approve ${chosen.length} items?`, `الموافقة على ${chosen.length} عنصر؟`)}</AlertDialogTitle>
              <AlertDialogDescription>
                {totalsText && <span className="block font-medium text-foreground">{totalsText}</span>}
                {tr('Each is approved at its current step, as if you approved it on its own. Rejecting or sending back is done one by one, with a reason.', 'تتم الموافقة على كل عنصر في خطوته الحالية كما لو وافقت عليه وحده. الرفض أو الإعادة يكون لكل عنصر على حدة مع ذكر السبب.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tr('Cancel', 'إلغاء')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void approveChosen()}>{tr(`Approve ${chosen.length}`, `موافقة ${chosen.length}`)}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ul className="space-y-3">
          {items.map((w) => {
            const key = `${w.docType}:${w.docId}`;
            const current = w.steps.find((s) => s.status === 'pending');
            return (
              <li key={key} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {pickable.length > 1 && w.canDecide ? (
                    <Checkbox className="self-center" checked={picked.has(key)} onCheckedChange={() => toggle(w)} aria-label={tr(`Select ${docTypeLabel(w.docType, tr)} ${w.number}`, `تحديد ${docTypeLabel(w.docType, tr)} ${w.number}`)} />
                  ) : <ClipboardCheck className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />}
                  <span className="font-semibold" dir="auto">{docTypeLabel(w.docType, tr)} {w.number}</span>
                  {w.amount > 0 && (
                    <span className="text-lg font-semibold tabular-nums">
                      {amountIsDays(w.docType) ? tr(`${w.amount} day${w.amount === 1 ? '' : 's'}`, `${w.amount} يوم`) : formatCurrency(w.amount, currencyOf(w.companyId))}
                    </span>
                  )}
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
                      <span dir="auto">{approverText(s.approvers, s.need, tr)}</span>
                      {s.ownerCompanyId && s.ownerCompanyId !== w.companyId && <span className="text-muted-foreground">· {companyName(s.ownerCompanyId) !== s.ownerCompanyId ? companyName(s.ownerCompanyId) : tr('the group', 'المجموعة')}</span>}
                      {s.decidedByName && <span className="text-muted-foreground">· {s.decidedByName}</span>}
                      {s.stuck && (
                        <span className="inline-flex items-center gap-0.5 text-destructive" title={tr('Nobody who can open this step\'s company can decide it. Change who decides in Settings → Approvals.', 'لا يوجد من يستطيع البت في هذه الخطوة من شركتها. غيّر من يقرر في الإعدادات ← الموافقات.')}>
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />{tr('nobody to decide', 'لا أحد للبت')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {failures[key] && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-destructive" role="alert"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{tr('Not approved:', 'لم تتم الموافقة:')} <span dir="auto">{failures[key]}</span></p>
                )}
                {w.steps.find((s) => s.note) && (
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">“{w.steps.filter((s) => s.note).map((s) => s.note).join(' · ')}”</p>
                )}

                {w.canDecide && box !== 'open' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {w.onBehalfOf && <span className="text-xs text-muted-foreground">{tr('You are standing in for a colleague.', 'أنت تنوب عن زميل.')}</span>}
                    <Input className="min-w-48 flex-1" placeholder={tr('Note (needed to reject or send back)', 'ملاحظة (مطلوبة للرفض أو الإعادة)')} aria-label={tr('Note', 'ملاحظة')} value={notes[key] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))} />
                    <Button variant="outline" disabled={busy === key} onClick={() => act(w, 'reject')}>{tr('Reject', 'رفض')}</Button>
                    <Button variant="outline" disabled={busy === key} onClick={() => act(w, 'send_back')}>{tr('Send back', 'إعادة للتعديل')}</Button>
                    <Button disabled={busy === key} onClick={() => act(w, 'approve')}>{tr('Approve', 'موافقة')}</Button>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Button variant="link" className="h-auto p-0 text-xs" asChild><Link href={docLink(w.docType)}>{tr('Open', 'فتح')}</Link></Button>
                  <Button
                    variant="link" className="h-auto gap-1 p-0 text-xs" aria-expanded={expanded === key}
                    onClick={() => setExpanded((k) => (k === key ? null : key))}
                  >
                    {box === 'open' && w.canReassign ? tr('History and hand on', 'السجل والتسليم') : tr('History', 'السجل')}
                    <ChevronDown className={`h-3 w-3 transition-transform ${expanded === key ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </Button>
                </div>
                {expanded === key && (
                  <div className="mt-3 border-t pt-3">
                    <ApprovalPanel docType={w.docType} docId={w.docId} onChanged={() => void load()} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </SectionPageShell>
  );
}
