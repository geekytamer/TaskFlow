'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { PackageX, PlusCircle, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Client, Delivery, SalesOrder } from '@/modules/finance/types';
import { getClients, getDeliveries, getSalesOrders } from '@/services/financeService';
import {
  cancelCustomerReturn, createCustomerReturn, getCustomerReturns, receiveCustomerReturn,
  type CustomerReturn, type CustomerReturnStatus, type ReturnCondition,
} from '@/services/returnsService';

const statusStyles: Record<CustomerReturnStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

type LineForm = { quantity: string; condition: ReturnCondition };

/**
 * Customer returns (RMA): goods a client sends back against a shipped
 * delivery. Opening a return moves nothing; receiving it restocks or writes
 * the goods off and can issue the credit note.
 */
export function ReturnsPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';

  const [returns, setReturns] = React.useState<CustomerReturn[]>([]);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [orders, setOrders] = React.useState<SalesOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [receiving, setReceiving] = React.useState<CustomerReturn | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [r, d, c, o] = await Promise.all([getCustomerReturns(companyId), getDeliveries(companyId), getClients(companyId), getSalesOrders(companyId)]);
      setReturns(r);
      setDeliveries(d);
      setClients(c);
      setOrders(o);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load returns', 'تعذّر تحميل المرتجعات'), description: error?.message });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const deliveryById = React.useMemo(() => new Map(deliveries.map((d) => [d.id, d])), [deliveries]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—';
  const statusLabel = (s: CustomerReturnStatus) => ({ Draft: tr('Awaiting goods', 'بانتظار البضاعة'), Received: tr('Received', 'مستلَم'), Cancelled: tr('Cancelled', 'ملغى') }[s]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {tr('Goods a client sends back. Restocked goods return to the shelf and their cost comes off cost of sales; scrapped goods are written off. Receiving can issue the credit note.',
            'البضاعة التي يعيدها العميل. البضاعة المعادة للمخزون ترجع إلى الرف وتُخصم تكلفتها من تكلفة المبيعات؛ والتالفة تُشطب. ويمكن عند الاستلام إصدار الإشعار الدائن.')}
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusCircle className="me-2 h-4 w-4" />{tr('New return', 'مرتجع جديد')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Return', 'المرتجع')}</TableHead>
              <TableHead>{tr('Client', 'العميل')}</TableHead>
              <TableHead>{tr('Delivery', 'التسليم')}</TableHead>
              <TableHead>{tr('Goods', 'البضاعة')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
            ) : returns.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                <PackageX className="mx-auto mb-2 h-6 w-6" />{tr('No returns yet.', 'لا توجد مرتجعات بعد.')}
              </TableCell></TableRow>
            ) : returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.returnNumber}
                  <div className="text-xs text-muted-foreground">{format(r.createdAt, 'dd MMM yyyy')}</div>
                </TableCell>
                <TableCell dir="auto">{clientName(r.clientId)}</TableCell>
                <TableCell>{deliveryById.get(r.deliveryId)?.deliveryNumber ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {r.items.map((l) => (
                    <div key={l.deliveryLineIndex} dir="auto">
                      {l.quantity} × {l.description}{' '}
                      <span className="text-xs text-muted-foreground">({l.condition === 'Restock' ? tr('restock', 'للمخزون') : tr('scrap', 'تالف')})</span>
                    </div>
                  ))}
                  {r.reason && <div className="text-xs text-muted-foreground" dir="auto">{r.reason}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyles[r.status]}>{statusLabel(r.status)}</Badge>
                  {r.creditNoteId && <div className="mt-1 text-xs text-muted-foreground">{tr('Credited', 'صدر إشعار دائن')}</div>}
                </TableCell>
                <TableCell className="text-end">
                  {r.status === 'Draft' && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setReceiving(r)}>{tr('Receive', 'استلام')}</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!(await confirm({ title: tr(`Cancel ${r.returnNumber}?`, `إلغاء ${r.returnNumber}؟`), confirmText: tr('Cancel return', 'إلغاء المرتجع'), cancelText: tr('Keep', 'إبقاء'), destructive: true }))) return;
                        try { await cancelCustomerReturn(r.id); await load(); }
                        catch (error: any) { toast({ variant: 'destructive', title: tr('Could not cancel', 'تعذّر الإلغاء'), description: error?.message }); }
                      }}>{tr('Cancel', 'إلغاء')}</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewReturnDialog
        open={creating}
        onOpenChange={setCreating}
        deliveries={deliveries.filter((d) => d.status === 'Shipped' || d.status === 'Delivered')}
        returns={returns}
        clientName={(d) => clientName(orders.find((o) => o.id === d.salesOrderId)?.clientId ?? '')}
        tr={tr}
        onCreate={async (data) => {
          try {
            await createCustomerReturn(companyId, data);
            toast({ title: tr('Return opened', 'تم فتح المرتجع'), description: tr('Receive it when the goods arrive.', 'استلمه عند وصول البضاعة.') });
            setCreating(false);
            await load();
          } catch (error: any) {
            toast({ variant: 'destructive', title: tr('Could not open the return', 'تعذّر فتح المرتجع'), description: error?.message });
          }
        }}
      />
      <ReceiveDialog
        record={receiving}
        onOpenChange={(open) => { if (!open) setReceiving(null); }}
        tr={tr}
        onReceive={async (issueCredit) => {
          if (!receiving) return;
          try {
            const done = await receiveCustomerReturn(receiving.id, { issueCredit });
            toast({ title: tr(`${done.returnNumber} received`, `تم استلام ${done.returnNumber}`), description: done.creditNoteId ? tr('Credit note issued.', 'صدر الإشعار الدائن.') : undefined });
            setReceiving(null);
            await load();
          } catch (error: any) {
            toast({ variant: 'destructive', title: tr('Could not receive', 'تعذّر الاستلام'), description: error?.message });
          }
        }}
      />
    </div>
  );

}

function NewReturnDialog({ open, onOpenChange, deliveries, returns, clientName, tr, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveries: Delivery[];
  returns: CustomerReturn[];
  clientName: (d: Delivery) => string;
  tr: (en: string, ar: string) => string;
  onCreate: (data: { deliveryId: string; reason?: string; items: Array<{ deliveryLineIndex: number; quantity: number; condition: ReturnCondition }> }) => Promise<void>;
}) {
  const [deliveryId, setDeliveryId] = React.useState('');
  const [lines, setLines] = React.useState<Record<number, LineForm>>({});
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) { setDeliveryId(''); setLines({}); setReason(''); } }, [open]);

  const delivery = deliveries.find((d) => d.id === deliveryId);
  const returnedByLine = React.useMemo(() => {
    const totals = new Map<number, number>();
    for (const r of returns) {
      if (r.deliveryId !== deliveryId || r.status === 'Cancelled') continue;
      for (const l of r.items) totals.set(l.deliveryLineIndex, (totals.get(l.deliveryLineIndex) ?? 0) + l.quantity);
    }
    return totals;
  }, [returns, deliveryId]);

  const items = Object.entries(lines)
    .map(([index, l]) => ({ deliveryLineIndex: Number(index), quantity: Number(l.quantity), condition: l.condition }))
    .filter((l) => l.quantity > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tr('New return', 'مرتجع جديد')}</DialogTitle>
          <DialogDescription>{tr('Choose the delivery the goods came from, then how many come back and whether they can be sold again.', 'اختر التسليم الذي خرجت فيه البضاعة، ثم الكمية المعادة وهل يمكن بيعها مجدداً.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tr('Delivery', 'التسليم')}</Label>
            <Select value={deliveryId} onValueChange={(v) => { setDeliveryId(v); setLines({}); }}>
              <SelectTrigger><SelectValue placeholder={tr('Select a shipped delivery', 'اختر تسليماً مشحوناً')} /></SelectTrigger>
              <SelectContent>
                {deliveries.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">{tr('No shipped deliveries.', 'لا توجد تسليمات مشحونة.')}</div>}
                {deliveries.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.deliveryNumber}{clientName(d) !== '—' ? ` · ${clientName(d)}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {delivery && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('Item', 'الصنف')}</TableHead>
                  <TableHead className="w-24">{tr('Can return', 'يمكن إرجاعه')}</TableHead>
                  <TableHead className="w-28">{tr('Returning', 'المعاد')}</TableHead>
                  <TableHead className="w-36">{tr('Condition', 'الحالة')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delivery.items.map((line, index) => {
                  const left = Math.max(0, line.quantity - (returnedByLine.get(index) ?? 0));
                  const form = lines[index] ?? { quantity: '', condition: 'Restock' as ReturnCondition };
                  const set = (patch: Partial<LineForm>) => setLines((prev) => ({ ...prev, [index]: { ...form, ...patch } }));
                  return (
                    <TableRow key={index}>
                      <TableCell dir="auto">{line.description}</TableCell>
                      <TableCell className="tabular-nums">{left}</TableCell>
                      <TableCell>
                        <Input type="number" min={0} max={left} step="any" value={form.quantity} disabled={left === 0}
                          aria-label={tr(`Quantity of ${line.description} returning`, `كمية ${line.description} المعادة`)}
                          onChange={(e) => set({ quantity: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={form.condition} onValueChange={(v) => set({ condition: v as ReturnCondition })} disabled={left === 0}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Restock">{tr('Back to stock', 'إلى المخزون')}</SelectItem>
                            <SelectItem value="Scrap">{tr('Scrap', 'تالف')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <div className="space-y-1.5">
            <Label>{tr('Reason', 'السبب')}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('e.g. Boxes crushed in transit', 'مثال: علب متضررة أثناء النقل')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button disabled={!delivery || items.length === 0 || saving} onClick={async () => {
            setSaving(true);
            try { await onCreate({ deliveryId, reason: reason.trim() || undefined, items }); } finally { setSaving(false); }
          }}>
            <Undo2 className="me-2 h-4 w-4" />{tr('Open return', 'فتح المرتجع')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ record, onOpenChange, tr, onReceive }: {
  record: CustomerReturn | null;
  onOpenChange: (open: boolean) => void;
  tr: (en: string, ar: string) => string;
  onReceive: (issueCredit: boolean) => Promise<void>;
}) {
  const [issueCredit, setIssueCredit] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (record) setIssueCredit(true); }, [record]);
  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr(`Receive ${record?.returnNumber ?? ''}`, `استلام ${record?.returnNumber ?? ''}`)}</DialogTitle>
          <DialogDescription>
            {tr('Goods marked "back to stock" return to the shelf at their current cost, and that cost comes off cost of sales. Scrapped goods are written off.',
              'البضاعة المعادة للمخزون ترجع إلى الرف بتكلفتها الحالية وتُخصم من تكلفة المبيعات. والتالفة تُشطب.')}
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <Checkbox checked={issueCredit} onCheckedChange={(v) => setIssueCredit(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">{tr('Issue a credit note', 'إصدار إشعار دائن')}</span>
            <span className="block text-muted-foreground">{tr('For the returned goods at their invoiced price plus VAT, against the order’s invoice.', 'للبضاعة المعادة بسعر فوترتها مع الضريبة، مقابل فاتورة الطلب.')}</span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Not yet', 'ليس الآن')}</Button>
          <Button disabled={saving} onClick={async () => { setSaving(true); try { await onReceive(issueCredit); } finally { setSaving(false); } }}>
            {tr('Goods received', 'تم استلام البضاعة')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
