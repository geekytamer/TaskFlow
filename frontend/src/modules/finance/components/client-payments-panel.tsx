'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useLiveRefresh } from '@/lib/live';
import { getClients, getInvoices } from '@/services/financeService';
import {
  listCompanyClientPayments, openClientPaymentFile, readFileBase64, recordCheque, removeClientPayment,
  saveClientPaymentSettings, setClientPaymentStatus, type ClientPaymentRecord, type ClientPaymentSettings, type RecordStatus,
} from '@/services/clientPaymentsService';
import type { Invoice } from '../types';
import { money, shortDate, useTr, type Tr } from '@/modules/flexi/components/flexi-ui';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysLeft = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000);
/** The same day next month, clamped to the month's end: the next cheque in a series. */
const nextMonth = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m, Math.min(d, last)));
  return t.toISOString().slice(0, 10);
};

const statusLabel = (s: RecordStatus, tr: Tr) => ({
  received: tr('To deposit', 'بانتظار الإيداع'), deposited: tr('Deposited', 'مودَع'), cleared: tr('Cleared', 'تم الصرف'),
  bounced: tr('Bounced', 'مرتجع'), returned: tr('Handed back', 'أُعيد للعميل'), pending: tr('To check', 'بانتظار التحقق'),
  confirmed: tr('Confirmed', 'مؤكَّد'), rejected: tr('Rejected', 'مرفوض'),
}[s]);
const STATUS_STYLE: Record<RecordStatus, string> = {
  received: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  deposited: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  cleared: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  bounced: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  returned: 'bg-muted text-muted-foreground',
  pending: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
};

/** What the client was told about this record, in one short line. */
function messagesLine(r: ClientPaymentRecord, tr: Tr): string | null {
  const sent = r.messages.filter((m) => m.status === 'sent');
  const failed = r.messages.filter((m) => m.status === 'failed');
  if (!sent.length && !failed.length) return null;
  const channels = [...new Set(sent.map((m) => (m.channel === 'whatsapp' ? 'WhatsApp' : tr('email', 'البريد'))))].join(tr(' and ', ' و'));
  const parts = [];
  if (sent.length) parts.push(tr(`Client told by ${channels}`, `أُبلغ العميل عبر ${channels}`));
  if (failed.length) parts.push(tr(`${failed.length} message(s) failed, retrying`, `تعذّر إرسال ${failed.length}، ستتم إعادة المحاولة`));
  return parts.join(' · ');
}

export function ClientPaymentsPanel() {
  const { tr, language } = useTr();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const invoiceFilter = useSearchParams().get('invoice');
  const [records, setRecords] = React.useState<ClientPaymentRecord[] | null>(null);
  const [settings, setSettings] = React.useState<ClientPaymentSettings | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [clientNames, setClientNames] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [asking, setAsking] = React.useState<{ record: ClientPaymentRecord; status: 'bounced' | 'rejected' } | null>(null);
  const [showDone, setShowDone] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      const [data, inv, clients] = await Promise.all([listCompanyClientPayments(companyId), getInvoices(companyId), getClients(companyId).catch(() => [])]);
      setRecords(data.records);
      setSettings(data.settings);
      setInvoices(inv);
      setClientNames(Object.fromEntries(clients.map((c) => [c.id, c.name])));
    } catch (error) {
      toast({ title: tr('Could not load cheques', 'تعذّر تحميل الشيكات'), description: (error as Error).message, variant: 'destructive' });
      setRecords([]);
    }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['invoices', 'payments'], () => load());

  const fail = (error: unknown) => toast({ title: tr('That did not work', 'لم تتم العملية'), description: (error as Error).message, variant: 'destructive' });

  const move = async (r: ClientPaymentRecord, status: RecordStatus, extra: { reason?: string } = {}) => {
    setBusy(r.id);
    try {
      await setClientPaymentStatus(r.id, status, extra);
      toast({
        title: status === 'cleared' || status === 'confirmed'
          ? tr('Payment recorded on the invoice', 'سُجّلت الدفعة على الفاتورة')
          : statusLabel(status, tr),
      });
      await load();
    } catch (error) { fail(error); }
    setBusy(null);
  };

  const remove = async (r: ClientPaymentRecord) => {
    if (!(await confirm({ title: tr('Remove this entry?', 'حذف هذا السجل؟'), description: tr('Use this only for an entry made by mistake.', 'استخدم هذا فقط لسجل أُدخل بالخطأ.'), destructive: true, confirmText: tr('Remove', 'حذف'), cancelText: tr('Cancel', 'إلغاء') }))) return;
    setBusy(r.id);
    try { await removeClientPayment(r.id); await load(); } catch (error) { fail(error); }
    setBusy(null);
  };

  const saveSettings = async (patch: Partial<ClientPaymentSettings>) => {
    if (!companyId || !settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try { setSettings(await saveClientPaymentSettings(companyId, patch)); } catch (error) { fail(error); void load(); }
  };

  if (!companyId) return null;
  const shown = (records ?? []).filter((r) => !invoiceFilter || r.invoiceId === invoiceFilter);
  const group = (statuses: RecordStatus[]) => shown.filter((r) => statuses.includes(r.status));
  const toDeposit = group(['received']).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const deposited = group(['deposited']);
  const toCheck = group(['pending']);
  const bounced = group(['bounced']);
  const done = group(['cleared', 'confirmed', 'rejected', 'returned']).sort((a, b) => b.statusAt.localeCompare(a.statusAt));
  const thisWeek = toDeposit.filter((r) => r.dueDate && daysLeft(r.dueDate) <= 7);
  const filteredInvoice = invoiceFilter ? invoices.find((i) => i.id === invoiceFilter) : undefined;

  const row = (r: ClientPaymentRecord) => {
    const cheque = r.method === 'cheque';
    const left = cheque && r.status === 'received' && r.dueDate ? daysLeft(r.dueDate) : null;
    const told = messagesLine(r, tr);
    const actions: Array<{ label: string; run: () => void; variant?: 'default' | 'outline' | 'destructive' | 'ghost' }> = [];
    if (r.status === 'received') {
      actions.push({ label: tr('Deposited', 'تم الإيداع'), run: () => move(r, 'deposited') });
      actions.push({ label: tr('Cleared', 'تم الصرف'), run: () => move(r, 'cleared'), variant: 'outline' });
      actions.push({ label: tr('Bounced', 'مرتجع'), run: () => setAsking({ record: r, status: 'bounced' }), variant: 'outline' });
      actions.push({ label: tr('Handed back', 'أُعيد للعميل'), run: () => move(r, 'returned'), variant: 'ghost' });
      actions.push({ label: tr('Remove', 'حذف'), run: () => remove(r), variant: 'ghost' });
    } else if (r.status === 'deposited') {
      actions.push({ label: tr('Cleared', 'تم الصرف'), run: () => move(r, 'cleared') });
      actions.push({ label: tr('Bounced', 'مرتجع'), run: () => setAsking({ record: r, status: 'bounced' }), variant: 'outline' });
      actions.push({ label: tr('Not deposited yet', 'لم يُودَع بعد'), run: () => move(r, 'received'), variant: 'ghost' });
    } else if (r.status === 'bounced') {
      actions.push({ label: tr('Deposit again', 'إيداع مرة أخرى'), run: () => move(r, 'deposited'), variant: 'outline' });
    } else if (r.status === 'pending') {
      actions.push({ label: tr('Confirm', 'تأكيد'), run: () => move(r, 'confirmed') });
      actions.push({ label: tr('Reject', 'رفض'), run: () => setAsking({ record: r, status: 'rejected' }), variant: 'outline' });
      if (!r.fromPortal) actions.push({ label: tr('Remove', 'حذف'), run: () => remove(r), variant: 'ghost' });
    }
    return (
      <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">{money(r.amount, r.currency || 'OMR', language)}</span>
            <Badge variant="outline" className={`border-transparent ${STATUS_STYLE[r.status]}`}>{statusLabel(r.status, tr)}</Badge>
            {left !== null && left < 0 && <Badge variant="outline" className="border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">{tr(`${-left} days past its date`, `تجاوز تاريخه بـ ${-left} يوم`)}</Badge>}
            {left !== null && left >= 0 && left <= 7 && <Badge variant="outline">{left === 0 ? tr('Today', 'اليوم') : left === 1 ? tr('Tomorrow', 'غدًا') : left === 2 ? tr('In 2 days', 'بعد يومين') : tr(`In ${left} days`, `بعد ${left} أيام`)}</Badge>}
            {r.fromPortal && <Badge variant="outline">{tr('From the portal', 'من البوابة')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {r.clientName ?? '—'} · <bdi dir="ltr">{r.invoiceNumber}</bdi>
            {cheque
              ? <> · {tr('Cheque', 'شيك')} <bdi dir="ltr">{r.chequeNumber}</bdi>{r.bankName && <> · {r.bankName}</>}{r.dueDate && <> · {tr('dated', 'بتاريخ')} {shortDate(r.dueDate, language)}</>}</>
              : <> · {tr('Transfer', 'تحويل')}{r.paidOn && <> {tr('on', 'في')} {shortDate(r.paidOn, language)}</>}{r.reference && <> · {tr('ref', 'مرجع')} <bdi dir="ltr">{r.reference}</bdi></>}</>}
          </p>
          {r.reason && <p className="text-sm text-red-700 dark:text-red-300">{tr('Reason:', 'السبب:')} {r.reason}</p>}
          {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
          {told && <p className="text-xs text-muted-foreground">{told}</p>}
          {r.files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.files.map((f) => (
                <button key={f.id} type="button" className="text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => openClientPaymentFile(f.id).catch(fail)}>
                  {cheque ? tr('Cheque image', 'صورة الشيك') : tr('Receipt', 'الإيصال')}: {f.fileName}
                </button>
              ))}
            </div>
          )}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {actions.map((a) => <Button key={a.label} size="sm" variant={a.variant ?? 'default'} disabled={busy === r.id} onClick={a.run}>{a.label}</Button>)}
          </div>
        )}
      </li>
    );
  };

  const section = (title: string, description: string | null, items: ClientPaymentRecord[], empty?: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title} <span className="ms-1 text-muted-foreground">{items.length}</span></CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {items.length === 0
          ? <p className="py-2 text-sm text-muted-foreground">{empty ?? tr('Nothing here.', 'لا شيء هنا.')}</p>
          : <ul className="divide-y">{items.map(row)}</ul>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{tr('Cheques and transfers', 'الشيكات والتحويلات')}</h2>
          <p className="text-sm text-muted-foreground">
            {filteredInvoice
              ? tr(`Showing invoice ${filteredInvoice.invoiceNumber} only.`, `يظهر هنا ما يخص الفاتورة ${filteredInvoice.invoiceNumber} فقط.`)
              : tr('Post-dated cheques from clients and transfers they reported. A cheque becomes a payment on its invoice when it clears.', 'الشيكات المؤجلة من العملاء والتحويلات التي أبلغوا عنها. يصبح الشيك دفعة على فاتورته عند صرفه.')}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>{tr('Record cheques', 'تسجيل شيكات')}</Button>
      </div>

      {settings && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={settings.remindersEnabled} onCheckedChange={(v) => saveSettings({ remindersEnabled: v })} />
              {tr('Remind the client on WhatsApp and by email before each deposit', 'ذكّر العميل على واتساب وبالبريد قبل كل إيداع')}
            </label>
            {settings.remindersEnabled && (
              <>
                <label className="flex items-center gap-2">
                  <Input type="number" min={1} max={14} className="h-9 w-20" value={settings.daysBefore}
                    onChange={(e) => setSettings({ ...settings, daysBefore: Number(e.target.value) })}
                    onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 14) void saveSettings({ daysBefore: n }); }} />
                  {tr('days before', 'أيام قبل الإيداع')}
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={settings.onTheDay} onCheckedChange={(v) => saveSettings({ onTheDay: v })} />
                  {tr('and again on the day', 'ومرة أخرى يوم الإيداع')}
                </label>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {records === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : (
        <>
          {section(tr('To deposit', 'بانتظار الإيداع'),
            thisWeek.length ? tr(`${thisWeek.length} to deposit within 7 days.`, `${thisWeek.length} للإيداع خلال 7 أيام.`) : null,
            toDeposit, tr('No cheques waiting.', 'لا توجد شيكات بانتظار الإيداع.'))}
          {toCheck.length > 0 && section(tr('Transfers to check', 'تحويلات بانتظار التحقق'), tr('Match each one with the bank statement, then confirm it.', 'طابق كل تحويل مع كشف البنك ثم أكّده.'), toCheck)}
          {deposited.length > 0 && section(tr('Deposited, waiting to clear', 'مودَعة بانتظار الصرف'), null, deposited)}
          {bounced.length > 0 && section(tr('Bounced', 'مرتجعة'), tr('Each has a follow-up for the client’s owner.', 'لكل شيك مرتجع متابعة لمسؤول العميل.'), bounced)}
          {done.length > 0 && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowDone((v) => !v)}>
                {showDone ? tr('Hide finished', 'إخفاء المنتهية') : tr(`Show finished (${done.length})`, `عرض المنتهية (${done.length})`)}
              </Button>
              {showDone && section(tr('Finished', 'منتهية'), null, done.slice(0, 100))}
            </div>
          )}
        </>
      )}

      <AddChequesDialog
        open={adding} onOpenChange={setAdding} tr={tr} language={language}
        invoices={invoices.filter((i) => i.status !== 'Draft' && i.status !== 'Paid' && (i.outstandingAmount ?? i.total) > 0)}
        clientNames={clientNames} defaultInvoiceId={invoiceFilter ?? undefined}
        onSaved={load}
      />

      <ReasonDialog
        asking={asking} tr={tr} onClose={() => setAsking(null)}
        onSubmit={async (reason) => { if (asking) { const a = asking; setAsking(null); await move(a.record, a.status, { reason }); } }}
      />
    </div>
  );
}

function ReasonDialog({ asking, tr, onClose, onSubmit }: {
  asking: { record: ClientPaymentRecord; status: 'bounced' | 'rejected' } | null; tr: Tr; onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState('');
  React.useEffect(() => { setReason(''); }, [asking]);
  const bounced = asking?.status === 'bounced';
  return (
    <Dialog open={Boolean(asking)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bounced ? tr('Cheque bounced', 'شيك مرتجع') : tr('Reject this transfer', 'رفض هذا التحويل')}</DialogTitle>
          <DialogDescription>
            {bounced
              ? tr('The client is told on WhatsApp and by email, and a follow-up is raised for their owner. The reason stays with the team.', 'يُبلَّغ العميل على واتساب وبالبريد، وتُنشأ متابعة لمسؤوله. السبب يبقى عند الفريق.')
              : tr('The client sees this reason in the portal and in the message we send.', 'سيرى العميل هذا السبب في البوابة وفي الرسالة المرسلة.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cp-reason">{tr('Reason', 'السبب')}</Label>
          <Textarea id="cp-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} dir="auto" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button variant="destructive" disabled={reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>{bounced ? tr('Mark bounced', 'تسجيل كمرتجع') : tr('Reject', 'رفض')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Records the cheques a client handed over for one invoice. "Save and add the
 * next" keeps the invoice and bank, and moves the date one month on, so a set
 * of instalment cheques goes in quickly.
 */
function AddChequesDialog({ open, onOpenChange, tr, language, invoices, clientNames, defaultInvoiceId, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; tr: Tr; language: string;
  invoices: Invoice[]; clientNames: Record<string, string>; defaultInvoiceId?: string; onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [invoiceId, setInvoiceId] = React.useState('');
  const [chequeNumber, setChequeNumber] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [dueDate, setDueDate] = React.useState(todayIso());
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setInvoiceId(defaultInvoiceId && invoices.some((i) => i.id === defaultInvoiceId) ? defaultInvoiceId : '');
    setChequeNumber(''); setBankName(''); setAmount(''); setDueDate(todayIso()); setFile(null); setError(null); setCount(0);
  }, [open, defaultInvoiceId, invoices]);

  const invoice = invoices.find((i) => i.id === invoiceId);
  const options = invoices.map((i) => ({
    value: i.id,
    label: `${i.invoiceNumber} · ${clientNames[i.clientId] ?? ''} · ${money(i.outstandingAmount ?? i.total, i.currency || 'OMR', language)}`,
  }));

  const save = async (andNext: boolean) => {
    if (!invoice) return setError(tr('Choose the invoice.', 'اختر الفاتورة.'));
    const n = Number(amount.replace(/,/g, ''));
    if (!chequeNumber.trim()) return setError(tr('Enter the cheque number.', 'أدخل رقم الشيك.'));
    if (!Number.isFinite(n) || n <= 0) return setError(tr('Enter the amount.', 'أدخل المبلغ.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return setError(tr('Enter the cheque date.', 'أدخل تاريخ الشيك.'));
    setSaving(true);
    setError(null);
    try {
      await recordCheque(invoice.id, {
        amount: n, chequeNumber: chequeNumber.trim(), bankName: bankName.trim() || undefined, dueDate,
        ...(file ? { fileName: file.name, contentBase64: await readFileBase64(file) } : {}),
      });
      setCount((c) => c + 1);
      await onSaved();
      if (andNext) {
        // Cheque books number on: suggest the next one.
        setChequeNumber((v) => (/^\d+$/.test(v) ? String(Number(v) + 1).padStart(v.length, '0') : ''));
        setDueDate(nextMonth(dueDate));
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
      } else {
        onOpenChange(false);
        toast({ title: tr('Cheque recorded', 'سُجّل الشيك') });
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('Record cheques', 'تسجيل شيكات')}</DialogTitle>
          <DialogDescription>
            {tr('One entry per cheque. The client is reminded before each date.', 'سجل لكل شيك. يُذكَّر العميل قبل كل تاريخ.')}
            {count > 0 && <> {tr(`${count} recorded so far.`, `سُجّل ${count} حتى الآن.`)}</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{tr('Invoice', 'الفاتورة')}</Label>
            <Combobox options={options} value={invoiceId} onValueChange={setInvoiceId}
              placeholder={tr('Choose an open invoice', 'اختر فاتورة مفتوحة')} searchPlaceholder={tr('Search by number or client', 'ابحث برقم الفاتورة أو العميل')} emptyText={tr('No open invoices.', 'لا توجد فواتير مفتوحة.')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cp-no">{tr('Cheque number', 'رقم الشيك')}</Label>
              <Input id="cp-no" dir="ltr" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-bank">{tr('Bank', 'البنك')}</Label>
              <Input id="cp-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={tr('e.g. Bank Muscat', 'مثل بنك مسقط')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-amount">{tr('Amount', 'المبلغ')} {invoice?.currency && <span className="text-muted-foreground">({invoice.currency})</span>}</Label>
              <Input id="cp-amount" dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-date">{tr('Cheque date', 'تاريخ الشيك')}</Label>
              <Input id="cp-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-file">{tr('Photo of the cheque (optional)', 'صورة الشيك (اختياري)')}</Label>
            <Input id="cp-file" ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={() => save(true)}>{tr('Save and add the next', 'حفظ وإضافة التالي')}</Button>
          <Button disabled={saving} onClick={() => save(false)}>{tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
