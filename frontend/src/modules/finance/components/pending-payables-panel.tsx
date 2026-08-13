'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { billPendingPayable, getPendingPayables, type PendingPayable } from '@/services/financeService';
import { ArrowUpRight, FilePlus2, RefreshCw, ShoppingCart, Megaphone } from 'lucide-react';

/**
 * Money the company owes that nobody has raised a bill for yet: goods received
 * against a purchase order, and campaign deliverables handed to an external
 * vendor. Both are real obligations the moment they happen, but until a vendor
 * bill exists they sit outside AP, so payables ageing understates what is due.
 * This panel shows them with the source that created them and turns any of
 * them into a draft bill.
 */

const sourceIcon = {
  purchase_order: ShoppingCart,
  campaign_deliverable: Megaphone,
} as const;

interface DraftForm {
  amount: string;
  issueDate: string;
  dueDate: string;
  referenceInvoiceNumber: string;
  notes: string;
}

const isoToday = () => format(new Date(), 'yyyy-MM-dd');
const isoInDays = (days: number) => format(new Date(Date.now() + days * 86400000), 'yyyy-MM-dd');

export function PendingPayablesPanel({ onBilled }: { onBilled?: () => void }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const { money } = useCompanyCurrency();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const [rows, setRows] = React.useState<PendingPayable[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<PendingPayable | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<DraftForm>({
    amount: '',
    issueDate: isoToday(),
    dueDate: isoInDays(30),
    referenceInvoiceNumber: '',
    notes: '',
  });

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await getPendingPayables(selectedCompany.id));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not load pending payables', 'تعذّر تحميل المستحقات المعلّقة'),
        description: error?.message,
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openPreview = (row: PendingPayable) => {
    setSelected(row);
    setForm({
      amount: String(row.amount),
      issueDate: isoToday(),
      dueDate: isoInDays(30),
      referenceInvoiceNumber: '',
      notes: row.description,
    });
  };

  const enteredAmount = Number(form.amount);
  const amountValid = Number.isFinite(enteredAmount) && enteredAmount > 0 && (!selected || enteredAmount <= selected.amount + 0.0001);

  const handleCreate = async () => {
    if (!selectedCompany || !selected || !amountValid) return;
    setSaving(true);
    try {
      const bill = await billPendingPayable(selectedCompany.id, {
        sourceType: selected.sourceType,
        sourceId: selected.sourceId,
        amount: enteredAmount,
        issueDate: new Date(form.issueDate),
        dueDate: new Date(form.dueDate),
        referenceInvoiceNumber: form.referenceInvoiceNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast({
        title: tr('Draft bill created', 'تم إنشاء مسودة فاتورة'),
        description: `${bill.billNumber} · ${money(bill.amount)}`,
      });
      setSelected(null);
      await load();
      onBilled?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not create the bill', 'تعذّر إنشاء الفاتورة'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card data-tutorial="finance-pending-payables">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5" />
            {tr('Payables awaiting a bill', 'مستحقات بانتظار الفوترة')}
          </CardTitle>
          <CardDescription>
            {tr(
              'Amounts you already owe that have no vendor bill yet — received purchase orders and externally fulfilled campaign deliverables. Preview the source, then raise the bill.',
              'مبالغ مستحقة عليكم ولم تُصدر لها فاتورة مورّد بعد — أوامر شراء مستلمة ومخرجات حملات نُفّذت خارجياً. عاين المصدر ثم أنشئ الفاتورة.',
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(total)}</span>
          )}
          <Button variant="outline" size="icon" onClick={load} title={tr('Refresh', 'تحديث')}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            {tr('Nothing outstanding — every received order and external deliverable has been billed.', 'لا توجد مستحقات — كل أمر مستلم ومخرج خارجي تمت فوترته.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Source', 'المصدر')}</TableHead>
                  <TableHead>{tr('Vendor', 'المورّد')}</TableHead>
                  <TableHead>{tr('Description', 'الوصف')}</TableHead>
                  <TableHead className="text-end">{tr('Already billed', 'مفوتر سابقاً')}</TableHead>
                  <TableHead className="text-end">{tr('Outstanding', 'المتبقي')}</TableHead>
                  <TableHead className="text-end">{tr('Action', 'إجراء')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const Icon = sourceIcon[row.sourceType];
                  return (
                    <TableRow key={`${row.sourceType}-${row.sourceId}`}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="space-y-0.5">
                            <Link
                              href={row.sourceRoute}
                              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                            >
                              {row.sourceLabel}
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {row.sourceType === 'purchase_order'
                                ? tr('Purchase order', 'أمر شراء')
                                : tr('Campaign deliverable', 'مخرج حملة')}
                              {row.sourceContext ? ` · ${row.sourceContext}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{row.vendorName}</TableCell>
                      <TableCell className="max-w-[22rem] text-sm text-muted-foreground">{row.description}</TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">
                        {row.alreadyBilled ? money(row.alreadyBilled) : '—'}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{money(row.amount)}</TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="outline" onClick={() => openPreview(row)}>
                          {tr('Preview & bill', 'معاينة وفوترة')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr('Preview payable', 'معاينة المستحق')}</DialogTitle>
            <DialogDescription>
              {tr(
                'Check what generated this obligation before turning it into a draft vendor bill.',
                'تحقق مما أنشأ هذا الالتزام قبل تحويله إلى مسودة فاتورة مورّد.',
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('Source', 'المصدر')}</span>
                  <Link href={selected.sourceRoute} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    {selected.sourceLabel}
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                {selected.sourceContext && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{tr('Context', 'السياق')}</span>
                    <span>{selected.sourceContext}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('Vendor', 'المورّد')}</span>
                  <span className="font-medium">{selected.vendorName}</span>
                </div>
                {Boolean(selected.alreadyBilled) && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{tr('Already billed', 'مفوتر سابقاً')}</span>
                    <span className="tabular-nums">{money(selected.alreadyBilled || 0)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{tr('Outstanding', 'المتبقي')}</span>
                  <span className="font-semibold tabular-nums">{money(selected.amount)}</span>
                </div>
                <p className="border-t pt-2 text-muted-foreground">{selected.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{tr('Bill amount', 'مبلغ الفاتورة')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                  {!amountValid && (
                    <p className="text-xs text-destructive">
                      {tr(
                        `Enter an amount between 0 and ${selected.amount}.`,
                        `أدخل مبلغاً بين 0 و ${selected.amount}.`,
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{tr("Vendor's invoice no.", 'رقم فاتورة المورّد')}</Label>
                  <Input
                    value={form.referenceInvoiceNumber}
                    onChange={(event) => setForm((prev) => ({ ...prev, referenceInvoiceNumber: event.target.value }))}
                    placeholder={tr('Optional', 'اختياري')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('Issue date', 'تاريخ الإصدار')}</Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, issueDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('Due date', 'تاريخ الاستحقاق')}</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{tr('Notes', 'ملاحظات')}</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              {amountValid && enteredAmount < selected.amount - 0.0001 && (
                <p className="text-xs text-muted-foreground">
                  {tr(
                    `Partial bill — ${money(selected.amount - enteredAmount)} stays outstanding on this source.`,
                    `فوترة جزئية — يبقى ${money(selected.amount - enteredAmount)} مستحقاً على هذا المصدر.`,
                  )}
                </p>
              )}
              <Badge variant="outline" className="font-normal">
                {tr('Created as Draft — approve it to post to AP.', 'تُنشأ كمسودة — اعتمدها لترحيلها إلى الذمم الدائنة.')}
              </Badge>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={saving}>
              {tr('Cancel', 'إلغاء')}
            </Button>
            <Button onClick={handleCreate} disabled={saving || !amountValid}>
              {saving ? tr('Creating…', 'جارٍ الإنشاء…') : tr('Create draft bill', 'إنشاء مسودة فاتورة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
