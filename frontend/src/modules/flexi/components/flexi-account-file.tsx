'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Lock, Pencil, Snowflake, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { adjustFlexiAccount, getFlexiAccount, setFlexiAccountState, type FlexiEvent } from '@/services/flexiService';
import { useCanManageFlexi } from '@/modules/flexi/lib/use-can-manage-flexi';
import { FlexiStatusBadge, flexiKindLabel } from './flexi-applications-page';
import { money, RequestLink, shortDate, StateBadge, UsageBar, useCompanyLoad, useTr, type Tr } from './flexi-ui';

type Action = 'adjust' | 'freeze' | 'unfreeze' | 'close';

const eventLabel = (kind: FlexiEvent['kind'], tr: Tr) => ({
  applied: tr('Applied', 'قدّم طلب'),
  approved: tr('Approved', 'تمت الموافقة'),
  rejected: tr('Rejected', 'تم الرفض'),
  withdrawn: tr('Withdrawn by the client', 'سحبه العميل'),
  adjusted: tr('Balance or terms changed', 'تعديل الرصيد أو الشروط'),
  frozen: tr('Frozen', 'إيقاف مؤقت'),
  unfrozen: tr('Unfrozen', 'إلغاء الإيقاف'),
  closed: tr('Closed', 'إغلاق الحساب'),
  terms_accepted: tr('Terms accepted', 'وافق على الشروط'),
}[kind]);

/** One client's Peak Flexi account: figures, controls, timeline, applications, invoices and requests. */
export function FlexiAccountFilePage() {
  const { tr, language } = useTr();
  const { contactId } = useParams<{ contactId: string }>();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const canManage = useCanManageFlexi();
  const { data, reload } = useCompanyLoad(selectedCompany?.id, (id) => getFlexiAccount(id, contactId), (m) => toast({ title: m, variant: 'destructive' }));
  const [action, setAction] = React.useState<Action | null>(null);

  if (!data) return <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>;
  const { account: a, currency, events, applications, openInvoices, requests } = data;
  const m = (n: number | null) => money(n, currency, language);

  return (
    <div className="space-y-6">
      <Link href="/flexi/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tr('All accounts', 'كل الحسابات')}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">{a.name}<StateBadge state={a.state} tr={tr} /></h1>
          <p className="text-sm text-muted-foreground">
            {a.state ? `${a.upfrontPct}% ${tr('down', 'مقدم')} · ${tr('up to', 'لين')} ${a.maxMonths} ${tr('months', 'شهر')} · ` : ''}
            <Link href={`/contacts/${a.contactId}`} className="text-primary underline-offset-4 hover:underline">{tr('Open the contact', 'افتح جهة الاتصال')}</Link>
          </p>
        </div>
        {canManage && (a.state === 'active' || a.state === 'frozen') && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAction('adjust')}><Pencil className="me-1 h-4 w-4" />{tr('Change balance or terms', 'عدّل الرصيد أو الشروط')}</Button>
            {a.state === 'active'
              ? <Button variant="outline" size="sm" onClick={() => setAction('freeze')}><Snowflake className="me-1 h-4 w-4" />{tr('Freeze', 'إيقاف مؤقت')}</Button>
              : <Button variant="outline" size="sm" onClick={() => setAction('unfreeze')}><Sun className="me-1 h-4 w-4" />{tr('Unfreeze', 'إلغاء الإيقاف')}</Button>}
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setAction('close')}><Lock className="me-1 h-4 w-4" />{tr('Close account', 'إغلاق الحساب')}</Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {([[tr('Balance', 'الرصيد'), a.balance], [tr('Used', 'المستخدم'), a.used], [tr('Available', 'المتاح'), a.available]] as const).map(([label, value]) => (
          <Card key={label}><CardContent className="space-y-1 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{m(value)}</p></CardContent></Card>
        ))}
      </div>
      <UsageBar pct={a.usedPct} />
      {a.state === 'frozen' && <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">{tr('Frozen: the client cannot spend from the balance until it is unfrozen.', 'موقوف مؤقتًا: العميل ما يقدر يصرف من الرصيد لين يتلغى الإيقاف.')}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">{tr('Timeline', 'السجل')}</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 ? <p className="text-sm text-muted-foreground">{tr('Nothing yet.', 'ما فيه شي لسا.')}</p> : (
              <ol className="space-y-4">
                {events.map((e) => (
                  <li key={e.id} className="border-s-2 ps-3 text-sm">
                    <p className="font-medium">{eventLabel(e.kind, tr)}{e.amountAfter !== null && e.kind !== 'applied' ? ` · ${e.amountBefore !== null ? `${m(e.amountBefore)} → ` : ''}${m(e.amountAfter)}` : ''}{e.kind === 'applied' && e.amountAfter !== null ? ` · ${m(e.amountAfter)}` : ''}</p>
                    {e.note && <p className="whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
                    <p className="text-xs text-muted-foreground">{e.actorName ?? (e.actorPortalUserId ? tr('The client', 'العميل') : '')} · {new Date(e.createdAt).toLocaleString(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB')}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{tr('Applications', 'الطلبات')}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {applications.map((app) => (
                  <li key={app.id}>
                    <Link href={`/flexi/applications?id=${app.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-primary">
                      <span>{flexiKindLabel(app.kind, tr)} · {shortDate(app.createdAt, language)}</span>
                      <FlexiStatusBadge status={app.status} tr={tr} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{tr('Open invoices', 'فواتير مفتوحة')}</CardTitle></CardHeader>
            <CardContent>
              {openInvoices.length === 0 ? <p className="text-sm text-muted-foreground">{tr('None.', 'لا يوجد.')}</p> : (
                <ul className="divide-y text-sm">
                  {openInvoices.map((i) => <li key={i.id} className="flex justify-between gap-2 py-2"><span>{i.number} · {shortDate(i.dueDate, language)}</span><span className="tabular-nums">{m(i.outstanding)}</span></li>)}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{tr('Campaign requests', 'طلبات الحملات')}</CardTitle></CardHeader>
            <CardContent>
              {requests.length === 0 ? <p className="text-sm text-muted-foreground">{tr('None.', 'لا يوجد.')}</p> : (
                <ul className="divide-y text-sm">
                  {requests.map((r) => (
                    <li key={r.id}><RequestLink id={r.id} className="flex justify-between gap-2 py-2 hover:text-primary"><span className="truncate">{r.title}</span><span className="shrink-0 tabular-nums">{m(r.budget)}</span></RequestLink></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {action && selectedCompany && (
        <ActionDialog action={action} account={a} currency={currency} tr={tr} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }}
          run={(input) => action === 'adjust'
            ? adjustFlexiAccount(selectedCompany.id, a.contactId, input)
            : setFlexiAccountState(selectedCompany.id, a.contactId, action, input.reason)} />
      )}
    </div>
  );
}

function ActionDialog({ action, account, currency, tr, onClose, onDone, run }: {
  action: Action;
  account: { balance: number; upfrontPct: number; maxMonths: number };
  currency: string;
  tr: Tr;
  onClose: () => void;
  onDone: () => void;
  run: (input: { amount?: number; upfrontPct?: number; maxMonths?: number; reason: string }) => Promise<unknown>;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState(String(account.balance));
  const [upfront, setUpfront] = React.useState(String(account.upfrontPct));
  const [months, setMonths] = React.useState(String(account.maxMonths));
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const title = { adjust: tr('Change balance or terms', 'عدّل الرصيد أو الشروط'), freeze: tr('Freeze the account', 'إيقاف الحساب مؤقتًا'), unfreeze: tr('Unfreeze the account', 'إلغاء الإيقاف'), close: tr('Close the account', 'إغلاق الحساب') }[action];
  const body = {
    adjust: tr('The client sees the new balance and terms right away.', 'العميل يشوف الرصيد والشروط الجديدة على طول.'),
    freeze: tr('The client keeps the account but cannot spend from it until you unfreeze it.', 'الحساب يبقى، بس العميل ما يقدر يصرف منه لين تلغي الإيقاف.'),
    unfreeze: tr('The client can spend from the balance again.', 'العميل يقدر يصرف من الرصيد مرة ثانية.'),
    close: tr('The balance goes to 0 and Peak Flexi is turned off. The client can apply again later.', 'الرصيد يصير صفر وتنقفل بيك فلكسي للعميل. يقدر يقدّم من جديد بعدين.'),
  }[action];
  const valid = reason.trim().length > 0 && (action !== 'adjust' || (Number(amount) > 0 && upfront.trim() !== '' && months.trim() !== ''));

  async function submit() {
    setBusy(true);
    try {
      await run(action === 'adjust' ? { amount: Number(amount), upfrontPct: Number(upfront), maxMonths: Number(months), reason: reason.trim() } : { reason: reason.trim() });
      toast({ title: tr('Saved.', 'تم الحفظ.') });
      onDone();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
        {action === 'adjust' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label htmlFor="fa-amount">{tr('Balance', 'الرصيد')} ({currency})</Label><Input id="fa-amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="fa-upfront">{tr('Down payment %', 'المقدم %')}</Label><Input id="fa-upfront" type="number" min={0} max={100} value={upfront} onChange={(e) => setUpfront(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="fa-months">{tr('Max months', 'أقصى مدة')}</Label><Input id="fa-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} /></div>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="fa-reason">{tr('Reason (saved on the timeline)', 'السبب (ينحفظ في السجل)')}</Label>
          <Textarea id="fa-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button variant={action === 'close' ? 'destructive' : 'default'} disabled={busy || !valid} onClick={submit}>{title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
