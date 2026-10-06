'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarClock, MoreHorizontal, Pause, Pencil, Play, PlusCircle, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { Client } from '@/modules/finance/types';
import type { Supplier } from '@/modules/operations/types';
import { getClients } from '@/services/financeService';
import { getSuppliers } from '@/services/operationsService';
import {
  createRecurringDocument, deleteRecurringDocument, getRecurringDocuments, updateRecurringDocument,
  type RecurringBillContent, type RecurringDocument, type RecurringFrequency, type RecurringInput,
  type RecurringInvoiceContent, type RecurringKind, type RecurringMode,
} from '@/services/recurringService';

type Tr = (en: string, ar: string) => string;
type LineForm = { description: string; quantity: string; unitPrice: string };
type Form = {
  kind: RecurringKind; name: string; partyId: string; frequency: RecurringFrequency; startDate: string; endDate: string;
  mode: RecurringMode; paymentTermsDays: string; taxRate: string; notes: string; lines: LineForm[]; amount: string;
};

const today = () => format(new Date(), 'yyyy-MM-dd');
const blank = (kind: RecurringKind = 'invoice'): Form => ({
  kind, name: '', partyId: '', frequency: 'monthly', startDate: today(), endDate: '', mode: 'draft', paymentTermsDays: '30',
  taxRate: '5', notes: '', lines: [{ description: '', quantity: '1', unitPrice: '' }], amount: '',
});

const toForm = (r: RecurringDocument): Form => {
  const base = { ...blank(r.kind), name: r.name, partyId: r.partyId, frequency: r.frequency, startDate: r.startDate, endDate: r.endDate ?? '', mode: r.mode, paymentTermsDays: String(r.paymentTermsDays) };
  if (r.kind === 'invoice') {
    const c = r.content as RecurringInvoiceContent;
    return { ...base, taxRate: String(c.taxRate ?? 0), notes: c.notes ?? '', lines: c.lineItems.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })) };
  }
  const c = r.content as RecurringBillContent;
  return { ...base, taxRate: String(c.taxRate ?? 0), notes: c.notes ?? '', amount: String(c.amount) };
};

/** What one run is worth, VAT included. */
const runTotal = (r: RecurringDocument) => {
  if (r.kind === 'bill') return (r.content as RecurringBillContent).amount;
  const c = r.content as RecurringInvoiceContent;
  const net = c.lineItems.reduce((sum, l) => sum + l.amount, 0);
  return net * (1 + (c.taxRate ?? 0) / 100);
};

/**
 * Recurring invoices and bills: a schedule that creates the same document
 * every week, month, quarter or year, as a draft to review or issued straight
 * away. The server creates each run once, even if it was offline on the day.
 */
export function RecurringPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { money } = useCompanyCurrency();
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';

  const [items, setItems] = React.useState<RecurringDocument[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<{ record: RecurringDocument | null; form: Form } | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [r, c, s] = await Promise.all([getRecurringDocuments(companyId), getClients(companyId), getSuppliers(companyId).catch(() => [])]);
      setItems(r); setClients(c); setSuppliers(s);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load recurring documents', 'تعذّر تحميل المستندات المتكررة'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const partyName = (r: RecurringDocument) =>
    (r.kind === 'invoice' ? clients.find((c) => c.id === r.partyId)?.name : suppliers.find((s) => s.id === r.partyId)?.name) ?? '—';
  const frequencyLabel = (f: RecurringFrequency) => ({
    weekly: tr('Weekly', 'أسبوعياً'), monthly: tr('Monthly', 'شهرياً'), quarterly: tr('Quarterly', 'ربع سنوي'), yearly: tr('Yearly', 'سنوياً'),
  }[f]);
  const act = async (fn: () => Promise<unknown>, failTitle: string) => {
    try { await fn(); await load(); } catch (error: any) { toast({ variant: 'destructive', title: failTitle, description: error?.message }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {tr('Retainers, rent and subscriptions: set them once and TaskFlow creates each invoice or bill on its date, as a draft to review or issued straight away.',
            'الاشتراكات والإيجارات والعقود الثابتة: أعدّها مرة واحدة وينشئ TaskFlow كل فاتورة في موعدها، مسودة للمراجعة أو صادرة مباشرة.')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ record: null, form: blank('bill') })}>
            <PlusCircle className="me-2 h-4 w-4" />{tr('Recurring bill', 'فاتورة مورّد متكررة')}
          </Button>
          <Button onClick={() => setEditing({ record: null, form: blank('invoice') })}>
            <PlusCircle className="me-2 h-4 w-4" />{tr('Recurring invoice', 'فاتورة متكررة')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Name', 'الاسم')}</TableHead>
              <TableHead>{tr('For', 'لـ')}</TableHead>
              <TableHead className="text-end">{tr('Each run', 'كل دورة')}</TableHead>
              <TableHead>{tr('Repeats', 'التكرار')}</TableHead>
              <TableHead>{tr('Next', 'التالي')}</TableHead>
              <TableHead>{tr('Recent runs', 'آخر الدورات')}</TableHead>
              <TableHead className="w-10"><span className="sr-only">{tr('Actions', 'الإجراءات')}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                <CalendarClock className="mx-auto mb-2 h-6 w-6" />{tr('Nothing recurring yet.', 'لا شيء متكرر بعد.')}
              </TableCell></TableRow>
            ) : items.map((r) => (
              <TableRow key={r.id} className={cn(!r.active && 'opacity-60')}>
                <TableCell>
                  <div className="font-medium" dir="auto">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.kind === 'invoice' ? tr('Invoice', 'فاتورة') : tr('Bill', 'فاتورة مورّد')}
                    {' · '}{r.mode === 'issue' ? (r.kind === 'invoice' ? tr('sent', 'تُرسل') : tr('approved', 'تُعتمد')) : tr('draft', 'مسودة')}
                  </div>
                </TableCell>
                <TableCell dir="auto">{partyName(r)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(runTotal(r))}</TableCell>
                <TableCell>{frequencyLabel(r.frequency)}{r.endDate ? <div className="text-xs text-muted-foreground">{tr(`until ${r.endDate}`, `حتى ${r.endDate}`)}</div> : null}</TableCell>
                <TableCell>
                  {r.active ? <span className="tabular-nums">{r.nextRunDate}</span> : <Badge variant="secondary">{tr('Paused or ended', 'متوقف أو منتهٍ')}</Badge>}
                </TableCell>
                <TableCell className="text-xs">
                  {(r.lastRuns ?? []).length === 0 ? <span className="text-muted-foreground">—</span> : (r.lastRuns ?? []).map((run) => (
                    <div key={run.runDate} title={run.message ?? undefined} className={cn(run.status === 'failed' && 'text-destructive', run.status === 'held' && 'text-amber-700 dark:text-amber-400')}>
                      {run.runDate}: {run.status === 'created' ? tr('created', 'أُنشئت') : run.status === 'held' ? tr('draft (over credit limit)', 'مسودة (فوق سقف الائتمان)') : tr('failed', 'فشلت')}
                    </div>
                  ))}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={tr(`Actions for ${r.name}`, `إجراءات ${r.name}`)}><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing({ record: r, form: toForm(r) })}><Pencil className="me-2 h-4 w-4" />{tr('Edit', 'تعديل')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => act(() => updateRecurringDocument(r.id, { active: !r.active }), tr('Could not update', 'تعذّر التحديث'))}>
                        {r.active ? <><Pause className="me-2 h-4 w-4" />{tr('Pause', 'إيقاف مؤقت')}</> : <><Play className="me-2 h-4 w-4" />{tr('Resume', 'استئناف')}</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={async () => {
                        if (!(await confirm({ title: tr(`Delete "${r.name}"?`, `حذف "${r.name}"؟`), description: tr('Documents already created stay. No new ones will be made.', 'تبقى المستندات التي أُنشئت. ولن يُنشأ غيرها.'), confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                        await act(() => deleteRecurringDocument(r.id), tr('Could not delete', 'تعذّر الحذف'));
                      }}><Trash2 className="me-2 h-4 w-4" />{tr('Delete', 'حذف')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <RecurringDialog
          initial={editing.form}
          isEdit={Boolean(editing.record)}
          clients={clients}
          suppliers={suppliers}
          tr={tr}
          money={money}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            try {
              if (editing.record) await updateRecurringDocument(editing.record.id, input);
              else await createRecurringDocument(companyId, input);
              toast({ title: tr('Schedule saved', 'تم حفظ الجدول') });
              setEditing(null);
              await load();
            } catch (error: any) {
              toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
            }
          }}
        />
      )}
    </div>
  );
}

function RecurringDialog({ initial, isEdit, clients, suppliers, tr, money, onClose, onSave }: {
  initial: Form; isEdit: boolean; clients: Client[]; suppliers: Supplier[]; tr: Tr; money: (n: number) => string;
  onClose: () => void; onSave: (input: RecurringInput) => Promise<void>;
}) {
  const [form, setForm] = React.useState<Form>(initial);
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (i: number, patch: Partial<LineForm>) => set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const isInvoice = form.kind === 'invoice';
  const parties = isInvoice ? clients : suppliers;

  const lineItems = form.lines
    .map((l) => ({ itemType: 'Manual' as const, description: l.description.trim(), quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 }))
    .filter((l) => l.description && l.quantity > 0)
    .map((l) => ({ ...l, amount: Number((l.quantity * l.unitPrice).toFixed(3)) }));
  const tax = Number(form.taxRate) || 0;
  const total = isInvoice ? lineItems.reduce((s, l) => s + l.amount, 0) * (1 + tax / 100) : Number(form.amount) || 0;
  const valid = form.name.trim().length >= 2 && form.partyId && form.startDate && (isInvoice ? lineItems.length > 0 : total > 0);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        kind: form.kind, name: form.name.trim(), partyId: form.partyId, frequency: form.frequency, startDate: form.startDate,
        endDate: form.endDate || null, mode: form.mode, paymentTermsDays: Number(form.paymentTermsDays) || 0,
        content: isInvoice
          ? { lineItems, taxRate: tax, notes: form.notes.trim() || undefined }
          : { amount: Number(form.amount), taxRate: tax, notes: form.notes.trim() || undefined },
      });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? tr('Edit schedule', 'تعديل الجدول') : isInvoice ? tr('New recurring invoice', 'فاتورة متكررة جديدة') : tr('New recurring bill', 'فاتورة مورّد متكررة جديدة')}
          </DialogTitle>
          <DialogDescription>
            {tr('Changes apply to documents not created yet.', 'تسري التغييرات على المستندات التي لم تُنشأ بعد.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rec-name">{tr('Name', 'الاسم')}</Label>
            <Input id="rec-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={isInvoice ? tr('e.g. Monthly social media retainer', 'مثال: عقد إدارة التواصل الشهري') : tr('e.g. Office rent', 'مثال: إيجار المكتب')} />
          </div>
          <div className="space-y-1.5">
            <Label>{isInvoice ? tr('Client', 'العميل') : tr('Supplier', 'المورّد')}</Label>
            <Select value={form.partyId} onValueChange={(v) => set({ partyId: v })}>
              <SelectTrigger><SelectValue placeholder={tr('Choose…', 'اختر…')} /></SelectTrigger>
              <SelectContent>{parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Repeats', 'التكرار')}</Label>
            <Select value={form.frequency} onValueChange={(v) => set({ frequency: v as RecurringFrequency })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{tr('Every week', 'كل أسبوع')}</SelectItem>
                <SelectItem value="monthly">{tr('Every month', 'كل شهر')}</SelectItem>
                <SelectItem value="quarterly">{tr('Every quarter', 'كل ربع')}</SelectItem>
                <SelectItem value="yearly">{tr('Every year', 'كل سنة')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-start">{tr('First date', 'التاريخ الأول')}</Label>
            <Input id="rec-start" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-end">{tr('Last date (optional)', 'التاريخ الأخير (اختياري)')}</Label>
            <Input id="rec-end" type="date" value={form.endDate} min={form.startDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('When created', 'عند الإنشاء')}</Label>
            <Select value={form.mode} onValueChange={(v) => set({ mode: v as RecurringMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{tr('Keep as a draft for me to review', 'أبقِها مسودة لأراجعها')}</SelectItem>
                <SelectItem value="issue">{isInvoice ? tr('Send it straight away', 'أرسلها مباشرة') : tr('Approve it straight away', 'اعتمدها مباشرة')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-terms">{tr('Due after (days)', 'تستحق بعد (أيام)')}</Label>
            <Input id="rec-terms" type="number" min={0} max={365} value={form.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: e.target.value })} />
          </div>
        </div>

        {isInvoice ? (
          <div className="space-y-2">
            <Label>{tr('Lines', 'البنود')}</Label>
            {form.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_2rem] items-center gap-2">
                <Input value={line.description} placeholder={tr('Description', 'الوصف')} aria-label={tr(`Line ${i + 1} description`, `وصف البند ${i + 1}`)} onChange={(e) => setLine(i, { description: e.target.value })} />
                <Input type="number" min={0} step="any" value={line.quantity} aria-label={tr(`Line ${i + 1} quantity`, `كمية البند ${i + 1}`)} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Input type="number" min={0} step="any" value={line.unitPrice} placeholder={tr('Price', 'السعر')} aria-label={tr(`Line ${i + 1} price`, `سعر البند ${i + 1}`)} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                <Button variant="ghost" size="icon" disabled={form.lines.length === 1} aria-label={tr(`Remove line ${i + 1}`, `حذف البند ${i + 1}`)} onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => set({ lines: [...form.lines, { description: '', quantity: '1', unitPrice: '' }] })}>
              <PlusCircle className="me-2 h-4 w-4" />{tr('Add line', 'إضافة بند')}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="rec-amount">{tr('Amount including VAT', 'المبلغ شاملاً الضريبة')}</Label>
            <Input id="rec-amount" type="number" min={0} step="any" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="rec-tax">{tr('VAT %', 'الضريبة %')}</Label>
            <Input id="rec-tax" type="number" min={0} max={100} step="any" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-notes">{tr('Notes', 'ملاحظات')}</Label>
            <Textarea id="rec-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">{tr('Each run:', 'كل دورة:')} <span className="font-semibold text-foreground tabular-nums">{money(total)}</span></p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
            <Button disabled={!valid || saving} onClick={submit}>{tr('Save schedule', 'حفظ الجدول')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
