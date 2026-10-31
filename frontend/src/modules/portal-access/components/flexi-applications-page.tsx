'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Paperclip, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import {
  approveFlexiApplication,
  downloadFlexiFile,
  getFlexiApplication,
  listFlexiApplications,
  rejectFlexiApplication,
  type FlexiStatus,
  type StaffFlexiApplication,
} from '@/services/portalAccessService';

type Tr = (en: string, ar: string) => string;
type Tab = 'new' | 'closed' | 'all';

const FLEXI_STANDARD = 850;

const STATUS_STYLE: Record<FlexiStatus, string> = {
  new: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  withdrawn: 'bg-muted text-muted-foreground',
};

export const flexiStatusLabel = (s: FlexiStatus, tr: Tr) => ({
  new: tr('To review', 'للمراجعة'),
  approved: tr('Approved', 'موافَق'),
  rejected: tr('Rejected', 'مرفوض'),
  withdrawn: tr('Withdrawn', 'مسحوب'),
}[s]);

export const flexiKindLabel = (k: StaffFlexiApplication['kind'], tr: Tr) =>
  k === 'activation' ? tr('Activation', 'تفعيل') : tr('Increase', 'زيادة');

export function FlexiStatusBadge({ status, tr }: { status: FlexiStatus; tr: Tr }) {
  return <Badge variant="outline" className={`border-transparent ${STATUS_STYLE[status]}`}>{flexiStatusLabel(status, tr)}</Badge>;
}

export const fmtMoney = (n: number | null | undefined, currency: string, lang: string) =>
  n === null || n === undefined ? '…' : new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 3 }).format(n);

/**
 * Peak Flexi applications from the client portal: activation (commercial
 * registration) and increases (statement and solvency papers). A reviewer
 * opens the papers and approves a balance with terms, or rejects with a
 * reason the client reads in their portal conversation.
 */
export function FlexiApplicationsPage() {
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apps, setApps] = React.useState<StaffFlexiApplication[] | null>(null);
  const [tab, setTab] = React.useState<Tab>('new');
  const openId = searchParams.get('id');

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    try {
      setApps(await listFlexiApplications(selectedCompany.id));
    } catch (error) {
      setApps([]);
      toast({ title: error instanceof Error ? error.message : tr('Could not load applications', 'تعذّر تحميل الطلبات'), variant: 'destructive' });
    }
  }, [selectedCompany, toast, tr]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [load]);

  const setOpen = (id: string | null) => router.replace(id ? `/crm/flexi?id=${encodeURIComponent(id)}` : '/crm/flexi', { scroll: false });
  const matches = (a: StaffFlexiApplication, t: Tab) => t === 'all' || (t === 'new' ? a.status === 'new' : a.status !== 'new');
  const count = (t: Tab) => (apps ?? []).filter((a) => matches(a, t)).length;
  const shown = (apps ?? []).filter((a) => matches(a, tab));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tr('Peak Flexi applications', 'طلبات بيك فلكسي')}</h1>
        <p className="text-sm text-muted-foreground">{tr('Clients asking to activate or raise their Peak Flexi balance.', 'العملاء اللي يطلبون تفعيل رصيد بيك فلكسي أو زيادته.')}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="new">{tr('To review', 'للمراجعة')} ({count('new')})</TabsTrigger>
          <TabsTrigger value="closed">{tr('Decided', 'تم البت فيها')} ({count('closed')})</TabsTrigger>
          <TabsTrigger value="all">{tr('All', 'الكل')} ({count('all')})</TabsTrigger>
        </TabsList>
      </Tabs>

      {apps === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{tr('Nothing here', 'ما فيه شيء هنا')}</p>
          <p className="max-w-md text-sm text-muted-foreground">{tr('When a client applies from the portal it appears here, and admins and managers are notified.', 'لما يقدّم عميل من البوابة يظهر طلبه هنا، ويوصل تنبيه للمدراء.')}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(a.id)} className="grid w-full gap-2 px-4 py-4 text-start transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{a.contactName}</span>
                    <FlexiStatusBadge status={a.status} tr={tr} />
                  </span>
                  <span className="block text-sm text-muted-foreground">{flexiKindLabel(a.kind, tr)} · {new Date(a.createdAt).toLocaleDateString(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')}</span>
                </span>
                <span className="text-sm">
                  <span className="block text-muted-foreground">{tr('Asked', 'المطلوب')}</span>
                  <span className="font-medium">{a.kind === 'activation' ? fmtMoney(FLEXI_STANDARD, a.currency, language) : fmtMoney(a.requestedAmount, a.currency, language)}</span>
                </span>
                <span className="text-sm">
                  <span className="block text-muted-foreground">{tr('Current balance', 'الرصيد الحالي')}</span>
                  <span className="font-medium">{fmtMoney(a.currentBalance, a.currency, language)}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Paperclip className="h-4 w-4" aria-hidden="true" />{a.files.length}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ApplicationSheet id={openId} onClose={() => setOpen(null)} onChanged={load} tr={tr} />
    </div>
  );
}

function ApplicationSheet({ id, onClose, onChanged, tr }: { id: string | null; onClose: () => void; onChanged: () => void; tr: Tr }) {
  const { language } = useI18n();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [app, setApp] = React.useState<StaffFlexiApplication | null>(null);
  const [amount, setAmount] = React.useState('');
  const [upfront, setUpfront] = React.useState('40');
  const [months, setMonths] = React.useState('6');
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setApp(null);
    if (!id || !selectedCompany) return;
    getFlexiApplication(selectedCompany.id, id).then((a) => {
      setApp(a);
      setAmount(String(a.kind === 'activation' ? FLEXI_STANDARD : a.requestedAmount ?? ''));
      // An increase keeps the client's down payment unless the reviewer changes it.
      setUpfront(String(a.currentTerms?.upfrontPct ?? 40));
      setMonths(a.kind === 'activation' ? '6' : '12');
      setNote('');
      setReason('');
    }).catch((error) => toast({ title: error instanceof Error ? error.message : tr('Could not open it', 'تعذّر فتحه'), variant: 'destructive' }));
  }, [id, selectedCompany, toast, tr]);

  async function decide(kind: 'approve' | 'reject') {
    if (!app || !selectedCompany) return;
    setBusy(true);
    try {
      const done = kind === 'approve'
        ? await approveFlexiApplication(selectedCompany.id, app.id, { amount: Number(amount), upfrontPct: Number(upfront), maxMonths: Number(months), reviewNote: note || undefined })
        : await rejectFlexiApplication(selectedCompany.id, app.id, reason);
      setApp(done);
      onChanged();
      toast({ title: kind === 'approve' ? tr('Approved. The client has been told.', 'تمت الموافقة، ووصل العميل خبر.') : tr('Rejected. The client has been told.', 'تم الرفض، ووصل العميل خبر.') });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const download = (file: StaffFlexiApplication['files'][number]) => {
    if (!app || !selectedCompany) return;
    downloadFlexiFile(selectedCompany.id, app.id, file).catch((error) => toast({ title: error instanceof Error ? error.message : tr('Download failed', 'فشل التنزيل'), variant: 'destructive' }));
  };

  return (
    <Sheet open={!!id} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{app ? app.contactName : tr('Loading…', 'جارٍ التحميل…')}</SheetTitle>
          <SheetDescription>{app ? `${flexiKindLabel(app.kind, tr)} · ${new Date(app.createdAt).toLocaleString(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')}` : ''}</SheetDescription>
        </SheetHeader>
        {app && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <FlexiStatusBadge status={app.status} tr={tr} />
              <Link href={`/contacts/${app.contactId}`} className="text-sm text-primary underline-offset-4 hover:underline">{tr('Open the contact', 'افتح جهة الاتصال')}</Link>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted-foreground">{tr('Current balance', 'الرصيد الحالي')}</dt><dd className="font-medium">{fmtMoney(app.currentBalance, app.currency, language)}</dd></div>
              {app.kind === 'increase' && <div><dt className="text-muted-foreground">{tr('Asked for', 'المطلوب')}</dt><dd className="font-medium">{fmtMoney(app.requestedAmount, app.currency, language)}</dd></div>}
              {app.crNumber && <div><dt className="text-muted-foreground">{tr('CR number', 'رقم السجل التجاري')}</dt><dd className="font-medium" dir="ltr">{app.crNumber}</dd></div>}
              {app.approvedAmount !== null && <div><dt className="text-muted-foreground">{tr('Approved', 'المعتمد')}</dt><dd className="font-medium">{fmtMoney(app.approvedAmount, app.currency, language)} · {app.upfrontPct}% · {app.maxMonths} {tr('months', 'شهر')}</dd></div>}
              {app.reviewerName && <div><dt className="text-muted-foreground">{tr('Decided by', 'قرار')}</dt><dd className="font-medium">{app.reviewerName}</dd></div>}
            </dl>
            {app.note && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{app.note}</p>}
            {app.reviewNote && <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm"><span className="block text-muted-foreground">{tr('Review note', 'ملاحظة المراجعة')}</span>{app.reviewNote}</p>}

            <div className="space-y-2">
              <p className="text-sm font-medium">{tr('Papers', 'الأوراق')}</p>
              <ul className="space-y-2">
                {app.files.map((f) => (
                  <li key={f.id}>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => download(f)}>
                      <Download className="h-4 w-4" aria-hidden="true" /><span className="truncate">{f.fileName}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            {app.status === 'new' && (
              <div className="space-y-6 border-t pt-6">
                <div className="space-y-3">
                  <p className="font-semibold">{tr('Approve', 'موافقة')}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1"><Label htmlFor="fx-amount">{tr('Balance', 'الرصيد')} ({app.currency})</Label><Input id="fx-amount" type="number" min={1} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="fx-upfront">{tr('Down payment %', 'المقدم %')}</Label><Input id="fx-upfront" type="number" min={0} max={100} value={upfront} onChange={(e) => setUpfront(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="fx-months">{tr('Max months', 'أقصى مدة')}</Label><Input id="fx-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
                  </div>
                  <Textarea placeholder={tr('Internal note (optional)', 'ملاحظة داخلية (اختياري)')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                  <Button disabled={busy || !(Number(amount) > 0) || upfront.trim() === '' || months.trim() === ''} onClick={() => decide('approve')}>{tr('Approve balance', 'اعتمد الرصيد')}</Button>
                </div>
                <div className="space-y-3">
                  <p className="font-semibold">{tr('Reject', 'رفض')}</p>
                  <Textarea placeholder={tr('Reason the client will read', 'السبب اللي بيقراه العميل')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                  <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => decide('reject')}>{tr('Reject', 'رفض')}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
