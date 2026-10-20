'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileText, Inbox, Paperclip, Plus, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { DATA_CHANGED_EVENT } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { createProposal, updateProposalStatus } from '@/services/crmService';
import {
  closePortalRequest,
  downloadPortalFile,
  getPortalRequest,
  listPortalRequests,
  reopenPortalRequest,
  type PortalRequestStatus,
  type StaffPortalRequest,
  type StaffPortalRequestDetail,
} from '@/services/portalAccessService';

type Tr = (en: string, ar: string) => string;
type Tab = 'open' | PortalRequestStatus | 'all';

const STATUS_STYLE: Record<PortalRequestStatus, string> = {
  in_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  proposal_ready: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  closed: 'bg-muted text-muted-foreground',
};

const statusLabel = (s: PortalRequestStatus, tr: Tr) => ({
  in_review: tr('Needs a proposal', 'بحاجة إلى عرض'),
  proposal_ready: tr('Proposal with client', 'العرض لدى العميل'),
  accepted: tr('Accepted', 'مقبول'),
  closed: tr('Closed', 'مغلق'),
}[s]);

function StatusBadge({ status, tr }: { status: PortalRequestStatus; tr: Tr }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{statusLabel(status, tr)}</span>;
}

const fmtDate = (value: string | null, language: string) =>
  value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : null;

const fmtMoney = (amount: number | null, currency: string, language: string) =>
  amount == null ? null : new Intl.NumberFormat(language === 'ar' ? 'ar-u-nu-latn' : 'en', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(amount);

/** "3 days ago" in the user's language. */
function ago(iso: string, language: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (days < 1) {
    const hours = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
    return rtf.format(-hours, 'hour');
  }
  return days < 30 ? rtf.format(-days, 'day') : rtf.format(-Math.floor(days / 30), 'month');
}

/**
 * Client portal requests, as their own list instead of notes on an
 * opportunity: each brief laid out, the shortlist linked, the client's files
 * downloadable, and a way to close one with a reason the client reads.
 */
export function ClientRequestsPage() {
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requests, setRequests] = React.useState<StaffPortalRequest[] | null>(null);
  const [tab, setTab] = React.useState<Tab>('open');
  const openId = searchParams.get('open');

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    try {
      setRequests(await listPortalRequests(selectedCompany.id));
    } catch (error) {
      setRequests([]);
      toast({ title: error instanceof Error ? error.message : tr('Could not load requests', 'تعذّر تحميل الطلبات'), variant: 'destructive' });
    }
  }, [selectedCompany, toast, tr]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [load]);

  const setOpen = (id: string | null) => router.replace(id ? `/crm/client-requests?open=${encodeURIComponent(id)}` : '/crm/client-requests', { scroll: false });

  const count = (t: Tab) => (requests ?? []).filter((r) => matches(r, t)).length;
  const shown = (requests ?? []).filter((r) => matches(r, tab));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tr('Client requests', 'طلبات العملاء')}</h1>
        <p className="text-sm text-muted-foreground">{tr('Campaign requests clients sent from the client portal.', 'طلبات الحملات التي أرسلها العملاء من بوابة العملاء.')}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="open">{tr('Open', 'مفتوحة')} ({count('open')})</TabsTrigger>
          <TabsTrigger value="in_review">{statusLabel('in_review', tr)} ({count('in_review')})</TabsTrigger>
          <TabsTrigger value="proposal_ready">{statusLabel('proposal_ready', tr)} ({count('proposal_ready')})</TabsTrigger>
          <TabsTrigger value="accepted">{statusLabel('accepted', tr)} ({count('accepted')})</TabsTrigger>
          <TabsTrigger value="closed">{statusLabel('closed', tr)} ({count('closed')})</TabsTrigger>
          <TabsTrigger value="all">{tr('All', 'الكل')} ({count('all')})</TabsTrigger>
        </TabsList>
      </Tabs>

      {requests === null ? (
        <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{tr('No requests here', 'لا توجد طلبات هنا')}</p>
          <p className="max-w-md text-sm text-muted-foreground">{tr('When a client sends a campaign request from the portal it appears here, and the account manager is notified.', 'عندما يرسل العميل طلب حملة من البوابة يظهر هنا ويُبلَّغ مدير الحساب.')}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className="grid w-full gap-2 px-4 py-4 text-start transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center md:gap-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.title}</span>
                    <StatusBadge status={r.status} tr={tr} />
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {r.client?.name ?? tr('Unknown client', 'عميل غير معروف')}{r.requester ? ` · ${r.requester.name}` : ''} · {ago(r.createdAt, language)}
                  </span>
                </span>
                <span className="text-sm">
                  <span className="block font-medium">{fmtMoney(r.budget, r.currency, language) ?? tr('No budget given', 'لم تُحدَّد ميزانية')}</span>
                  <span className="block text-muted-foreground">
                    {r.startDate || r.endDate ? `${fmtDate(r.startDate, language) ?? '…'} – ${fmtDate(r.endDate, language) ?? '…'}` : tr('Dates open', 'تواريخ مفتوحة')}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" />{r.shortlist.length}</span>
                  {r.fileCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-4 w-4" aria-hidden="true" />{r.fileCount}</span>}
                  <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" aria-hidden="true" />{r.proposalCount}</span>
                </span>
                <span className="text-sm text-muted-foreground md:text-end">{r.opportunity?.ownerName ?? tr('No owner', 'بلا مسؤول')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RequestSheet id={openId} onClose={() => setOpen(null)} onChanged={load} tr={tr} />
    </div>
  );
}

function matches(r: StaffPortalRequest, tab: Tab) {
  if (tab === 'all') return true;
  if (tab === 'open') return r.status === 'in_review' || r.status === 'proposal_ready';
  return r.status === tab;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function RequestSheet({ id, onClose, onChanged, tr }: { id: string | null; onClose: () => void; onChanged: () => void; tr: Tr }) {
  const { language } = useI18n();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<StaffPortalRequestDetail | null>(null);
  const [closing, setClosing] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  React.useEffect(() => {
    setDetail(null); setClosing(false); setReason(''); setComposing(false);
    if (!id || !selectedCompany) return;
    let cancelled = false;
    getPortalRequest(selectedCompany.id, id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((error) => { if (!cancelled) toast({ title: error instanceof Error ? error.message : tr('Request not found', 'الطلب غير موجود'), variant: 'destructive' }); });
    return () => { cancelled = true; };
  }, [id, selectedCompany, toast, tr]);

  const act = async (fn: () => Promise<StaffPortalRequestDetail>, done: string) => {
    setBusy(true);
    try {
      setDetail(await fn());
      setClosing(false); setReason('');
      toast({ title: done });
      onChanged();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not update', 'تعذّر التحديث'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const companyId = selectedCompany?.id;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!detail ? (
          <SheetHeader><SheetTitle>{tr('Loading…', 'جارٍ التحميل…')}</SheetTitle><SheetDescription className="sr-only">{tr('Client request', 'طلب عميل')}</SheetDescription></SheetHeader>
        ) : (
          <div className="space-y-6">
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={detail.status} tr={tr} /></div>
              <SheetTitle className="text-start">{detail.title}</SheetTitle>
              <SheetDescription className="text-start">
                {detail.client ? <Link href={`/contacts/${detail.client.id}`} className="font-medium underline-offset-4 hover:underline">{detail.client.name}</Link> : tr('Unknown client', 'عميل غير معروف')}
                {detail.requester && <> · {detail.requester.name} (<a href={`mailto:${detail.requester.email}`} className="underline-offset-4 hover:underline">{detail.requester.email}</a>)</>}
                {' · '}{fmtDate(detail.createdAt, language)}
              </SheetDescription>
            </SheetHeader>

            {detail.closedReason && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{tr('Closed. The client was told:', 'مغلق. أُبلغ العميل:')}</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{detail.closedReason}</p>
              </div>
            )}

            <section>
              <h3 className="mb-1 text-sm font-semibold">{tr('Brief', 'الملخص')}</h3>
              <dl className="divide-y rounded-lg border px-4">
                <Field label={tr('Objective', 'الهدف')}><p dir="auto" className="whitespace-pre-line leading-relaxed">{detail.objective}</p></Field>
                <Field label={tr('Budget', 'الميزانية')}>{fmtMoney(detail.budget, detail.currency, language) ?? <span className="text-muted-foreground">{tr('Not given', 'غير محددة')}</span>}</Field>
                <Field label={tr('Dates', 'التواريخ')}>
                  {detail.startDate || detail.endDate ? `${fmtDate(detail.startDate, language) ?? '…'} – ${fmtDate(detail.endDate, language) ?? '…'}` : <span className="text-muted-foreground">{tr('Open', 'مفتوحة')}</span>}
                </Field>
                <Field label={tr('Platforms', 'المنصات')}>
                  {detail.platforms.length ? <span className="flex flex-wrap gap-1">{detail.platforms.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)}</span> : <span className="text-muted-foreground">{tr('Any', 'أي منصة')}</span>}
                </Field>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{tr('Influencers the client chose', 'المؤثرون الذين اختارهم العميل')} ({detail.shortlist.length})</h3>
              {detail.shortlist.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tr('None: the client left the choice to Peak.', 'لا أحد: ترك العميل الاختيار لبيك.')}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detail.shortlist.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        {i.onRoster
                          ? <Link href={`/contacts/${i.id}`} className="font-medium underline-offset-4 hover:underline">{i.name}</Link>
                          : <Link href="/influencers/discover" className="font-medium underline-offset-4 hover:underline">{i.name}</Link>}
                        {i.handle && <span className="ms-2 text-muted-foreground" dir="ltr">{i.handle}</span>}
                      </span>
                      {!i.onRoster && <Badge variant="outline" className="shrink-0 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300">{tr('Not on the roster yet', 'ليس ضمن القائمة بعد')}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.files.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{tr('Files from the client', 'ملفات من العميل')}</h3>
                <ul className="divide-y rounded-lg border">
                  {detail.files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="truncate">{f.fileName}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => companyId && downloadPortalFile(companyId, f).catch(() => toast({ title: tr('Download failed', 'فشل التنزيل'), variant: 'destructive' }))}>
                        <Download className="me-1 h-4 w-4" aria-hidden="true" />{tr('Download', 'تنزيل')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">{tr('Proposals', 'العروض')}</h3>
              {detail.proposals.length === 0 && !composing && (
                <p className="text-sm text-muted-foreground">{tr('No proposal yet. The client is waiting for one.', 'لا يوجد عرض بعد. العميل بانتظار عرض.')}</p>
              )}
              {detail.proposals.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {detail.proposals.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate"><span className="font-medium">{p.title}</span> <span className="text-muted-foreground" dir="ltr">{p.number}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">{proposalLabel(p.staffStatus, tr)}</Badge>
                        {p.staffStatus === 'Draft' && (
                          <Button type="button" size="sm" disabled={busy}
                            onClick={() => companyId && act(async () => { await updateProposalStatus(p.id, 'Sent'); return getPortalRequest(companyId, detail.id); }, tr('Sent to the client', 'أُرسل إلى العميل'))}>
                            {tr('Send to client', 'إرسال إلى العميل')}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.opportunity && detail.status !== 'closed' && (composing ? (
                <ProposalForm tr={tr} currency={detail.currency} defaultTitle={detail.title} busy={busy} onCancel={() => setComposing(false)}
                  onSubmit={(input, send) => companyId && detail.opportunity && act(async () => {
                    await createProposal(companyId, { opportunityId: detail.opportunity!.id, status: send ? 'Sent' : 'Draft', ...input });
                    setComposing(false);
                    return getPortalRequest(companyId, detail.id);
                  }, send ? tr('Proposal sent to the client', 'أُرسل العرض إلى العميل') : tr('Draft saved', 'حُفظت المسودة'))} />
              ) : (
                <Button type="button" className="mt-3" onClick={() => setComposing(true)}>
                  <Plus className="me-1 h-4 w-4" aria-hidden="true" />{tr('Write proposal', 'كتابة عرض')}
                </Button>
              ))}
            </section>

            <section className="border-t pt-4">
              {detail.status === 'closed' && detail.closedAt ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => companyId && act(() => reopenPortalRequest(companyId, detail.id), tr('Request reopened', 'أُعيد فتح الطلب'))}>
                  {tr('Reopen request', 'إعادة فتح الطلب')}
                </Button>
              ) : detail.status === 'closed' || detail.status === 'accepted' ? null : closing ? (
                <div className="space-y-2">
                  <Label htmlFor="close-reason">{tr('Why can’t Peak take this on? The client will read this.', 'لماذا لا تستطيع بيك تنفيذ هذا؟ سيقرأ العميل هذا.')}</Label>
                  <Textarea id="close-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button type="button" variant="destructive" disabled={busy || reason.trim().length < 3}
                      onClick={() => companyId && act(() => closePortalRequest(companyId, detail.id, reason.trim()), tr('Request closed', 'أُغلق الطلب'))}>
                      {tr('Close and tell the client', 'إغلاق وإبلاغ العميل')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setClosing(false)}>{tr('Cancel', 'إلغاء')}</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => setClosing(true)}>{tr('Can’t take this on', 'لا يمكن تنفيذ هذا')}</Button>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const proposalLabel = (status: string, tr: Tr) => ({
  Draft: tr('Draft (not visible to client)', 'مسودة (لا يراها العميل)'),
  Sent: tr('With client', 'لدى العميل'),
  Accepted: tr('Accepted', 'مقبول'),
  Declined: tr('Declined', 'مرفوض'),
  Expired: tr('Expired', 'منتهي'),
}[status] ?? status);

interface LineDraft { description: string; quantity: string; unitPrice: string }

/** A proposal answering the request: priced lines the client accepts or declines in the portal. */
function ProposalForm({ tr, currency, defaultTitle, busy, onCancel, onSubmit }: {
  tr: Tr; currency: string; defaultTitle: string; busy: boolean; onCancel: () => void;
  onSubmit: (input: { title: string; validUntil: Date; items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>; notes?: string }, send: boolean) => void;
}) {
  const { language } = useI18n();
  const [title, setTitle] = React.useState(defaultTitle);
  const [validUntil, setValidUntil] = React.useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const [lines, setLines] = React.useState<LineDraft[]>([{ description: '', quantity: '1', unitPrice: '' }]);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const items = lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }));
  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.quantity * i.unitPrice) ? i.quantity * i.unitPrice : 0), 0);
  const submit = (send: boolean) => {
    const valid = title.trim().length >= 2 && items.length > 0
      && items.every((i) => i.description && i.quantity > 0 && Number.isFinite(i.unitPrice) && i.unitPrice >= 0);
    if (!valid) { setError(tr('Give a title and, for every line, a description, a quantity and a price.', 'أدخل عنوانًا، ولكل بند وصفًا وكمية وسعرًا.')); return; }
    setError(null);
    onSubmit({ title: title.trim(), validUntil: new Date(validUntil), items: items.map((i) => ({ ...i, lineTotal: i.quantity * i.unitPrice })), notes: notes.trim() || undefined }, send);
  };
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="mt-3 space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label htmlFor="prop-title" className="text-xs">{tr('Title', 'العنوان')}</Label>
          <Input id="prop-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="prop-valid" className="text-xs">{tr('Valid until', 'صالح حتى')}</Label>
          <Input id="prop-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium">{tr('Lines', 'البنود')}</p>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-center gap-2">
            <Input aria-label={tr('Description', 'الوصف')} placeholder={tr('e.g. 1 Reel by Lina', 'مثال: ريل واحد من لينا')} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <Input aria-label={tr('Quantity', 'الكمية')} type="number" min={1} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            <Input aria-label={tr('Unit price', 'سعر الوحدة')} type="number" min={0} step="any" inputMode="decimal" placeholder={currency} value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label={tr('Remove line', 'حذف البند')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '' }])}>
            <Plus className="me-1 h-4 w-4" aria-hidden="true" />{tr('Add line', 'إضافة بند')}
          </Button>
          <span className="text-sm font-semibold">{tr('Total', 'الإجمالي')}: {fmtMoney(total, currency, language)}</span>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="prop-notes" className="text-xs">{tr('Note to the client (optional)', 'ملاحظة للعميل (اختياري)')}</Label>
        <Textarea id="prop-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => submit(true)}>{tr('Send to client', 'إرسال إلى العميل')}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => submit(false)}>{tr('Save draft', 'حفظ كمسودة')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{tr('Cancel', 'إلغاء')}</Button>
      </div>
    </div>
  );
}
