'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getRfqs, getRfq, createRfq, addRfqQuote, deleteRfqQuote, awardRfqQuote, deleteRfq,
  getSuppliers, type Rfq,
} from '@/services/operationsService';
import type { Supplier } from '@/modules/operations/types';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft, Award, FileQuestion, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CreateRfqSheet({ onCreated }: { onCreated: () => void }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [items, setItems] = React.useState([{ description: '', quantity: '', unit: '' }]);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!selectedCompany) return;
    const clean = items
      .filter((i) => i.description.trim() && Number(i.quantity) > 0)
      .map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity), unit: i.unit.trim() || undefined }));
    if (!title.trim() || clean.length === 0) {
      toast({ variant: 'destructive', title: tr('Missing details', 'تفاصيل ناقصة'), description: tr('Add a title and at least one item.', 'أضف عنواناً وصنفاً واحداً على الأقل.') });
      return;
    }
    setSaving(true);
    try {
      await createRfq(selectedCompany.id, { title: title.trim(), notes: notes.trim() || undefined, items: clean });
      toast({ title: tr('RFQ created', 'تم إنشاء طلب عروض الأسعار') });
      setOpen(false); setTitle(''); setNotes(''); setItems([{ description: '', quantity: '', unit: '' }]);
      onCreated();
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button data-tutorial="rfq-create"><Plus className="me-2 h-4 w-4" />{tr('New RFQ', 'طلب عروض جديد')}</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader><SheetTitle>{tr('New request for quotation', 'طلب عروض أسعار جديد')}</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>{tr('Title', 'العنوان')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('e.g. Frozen fruit supply', 'مثال: توريد فواكه مجمدة')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tr('Items', 'الأصناف')}</Label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder={tr('Description', 'الوصف')} value={it.description}
                  onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <Input className="w-20" type="number" placeholder={tr('Qty', 'الكمية')} value={it.quantity}
                  onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <Input className="w-20" placeholder={tr('Unit', 'الوحدة')} value={it.unit}
                  onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                <Button variant="ghost" size="icon" disabled={items.length === 1}
                  onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setItems((p) => [...p, { description: '', quantity: '', unit: '' }])}>
              <Plus className="me-2 h-3.5 w-3.5" />{tr('Add item', 'إضافة صنف')}
            </Button>
          </div>
          <div className="grid gap-2">
            <Label>{tr('Notes', 'ملاحظات')}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving}>{tr('Create', 'إنشاء')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RfqDetail({ rfq: initial, suppliers, onBack }: { rfq: Rfq; suppliers: Supplier[]; onBack: () => void }) {
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [rfq, setRfq] = React.useState(initial);
  const [supplierId, setSupplierId] = React.useState('');
  const [supplierName, setSupplierName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [lead, setLead] = React.useState('');

  const refresh = async () => setRfq(await getRfq(rfq.id));

  const addQuote = async () => {
    const nameFromSupplier = suppliers.find((s) => s.id === supplierId)?.name;
    const name = nameFromSupplier || supplierName.trim();
    if (!name || !(Number(amount) > 0)) {
      toast({ variant: 'destructive', title: tr('Missing details', 'تفاصيل ناقصة'), description: tr('Add a supplier and amount.', 'أضف مورّداً ومبلغاً.') });
      return;
    }
    try {
      const updated = await addRfqQuote(rfq.id, {
        supplierId: supplierId || undefined, supplierName: name,
        totalAmount: Number(amount), leadTimeDays: lead ? Number(lead) : undefined,
      });
      setRfq(updated); setSupplierId(''); setSupplierName(''); setAmount(''); setLead('');
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const award = async (quoteId: string) => {
    try { setRfq(await awardRfqQuote(rfq.id, quoteId)); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const removeQuote = async (quoteId: string) => {
    try { setRfq(await deleteRfqQuote(rfq.id, quoteId)); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const best = rfq.quotes.length ? Math.min(...rfq.quotes.map((q) => q.totalAmount)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-2 h-4 w-4" />{tr('Back', 'رجوع')}</Button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{rfq.title}</h3>
          <p className="text-sm text-muted-foreground">{rfq.reference}</p>
        </div>
        <Badge variant={rfq.status === 'awarded' ? 'default' : 'secondary'}>{rfq.status}</Badge>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-semibold text-muted-foreground">{tr('Requested items', 'الأصناف المطلوبة')}</p>
        <div className="flex flex-wrap gap-2">
          {rfq.items.map((it, i) => (
            <Badge key={i} variant="outline">{it.description} · {it.quantity}{it.unit ? ` ${it.unit}` : ''}</Badge>
          ))}
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">{tr('Quotes', 'العروض')}</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Supplier', 'المورّد')}</TableHead>
              <TableHead className="text-end">{tr('Amount', 'المبلغ')}</TableHead>
              <TableHead className="text-end">{tr('Lead time', 'مدة التوريد')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfq.quotes.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">{tr('No quotes yet.', 'لا توجد عروض بعد.')}</TableCell></TableRow>
            )}
            {rfq.quotes.map((q) => {
              const awarded = rfq.awardedQuoteId === q.id;
              const isBest = q.totalAmount === best;
              return (
                <TableRow key={q.id} className={cn(awarded && 'bg-emerald-500/10')}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {q.supplierName}
                      {isBest && !awarded && <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">{tr('Lowest', 'الأقل')}</Badge>}
                      {awarded && <Badge className="gap-1"><Trophy className="h-3 w-3" />{tr('Awarded', 'تمت الترسية')}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-medium">{money(q.totalAmount)}</TableCell>
                  <TableCell className="text-end tabular-nums">{q.leadTimeDays ? `${q.leadTimeDays} ${tr('days', 'يوم')}` : '—'}</TableCell>
                  <TableCell className="text-end">
                    {!awarded && <Button variant="ghost" size="sm" onClick={() => award(q.id)}><Award className="me-1 h-4 w-4" />{tr('Award', 'ترسية')}</Button>}
                    <Button variant="ghost" size="icon" onClick={() => removeQuote(q.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-end gap-2 border-t p-3">
          {suppliers.length > 0 ? (
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-48"><SelectValue placeholder={tr('Supplier', 'المورّد')} /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input className="w-48" placeholder={tr('Supplier name', 'اسم المورّد')} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          )}
          <Input className="w-32" type="number" placeholder={tr('Total amount', 'المبلغ الإجمالي')} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input className="w-28" type="number" placeholder={tr('Lead (days)', 'مدة (أيام)')} value={lead} onChange={(e) => setLead(e.target.value)} />
          <Button onClick={addQuote}><Plus className="me-2 h-4 w-4" />{tr('Add quote', 'إضافة عرض')}</Button>
        </div>
      </div>
    </div>
  );
}

export function RfqPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [rfqs, setRfqs] = React.useState<Rfq[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<Rfq | null>(null);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([getRfqs(companyId), getSuppliers(companyId)]);
      setRfqs(r); setSuppliers(s);
    } catch { setRfqs([]); setSuppliers([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    try { setActive(await getRfq(id)); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const remove = async (id: string) => {
    const ok = await confirm({ title: tr('Delete RFQ?', 'حذف الطلب؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteRfq(id); load(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  return (
    <SectionPageShell
      title={tr('Requests for Quotation', 'طلبات عروض الأسعار')}
      description={tr('Collect supplier quotes for a purchase and award the best one.',
                      'اجمع عروض أسعار المورّدين لعملية شراء ورسِّ على الأفضل.')}
    >
      {active ? (
        <RfqDetail rfq={active} suppliers={suppliers} onBack={() => { setActive(null); load(); }} />
      ) : loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end"><CreateRfqSheet onCreated={load} /></div>
          {rfqs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
              <FileQuestion className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tr('No RFQs yet.', 'لا توجد طلبات عروض بعد.')}</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Reference', 'المرجع')}</TableHead>
                    <TableHead>{tr('Title', 'العنوان')}</TableHead>
                    <TableHead>{tr('Quotes', 'العروض')}</TableHead>
                    <TableHead>{tr('Status', 'الحالة')}</TableHead>
                    <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfqs.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => open(r.id)}>
                      <TableCell className="font-medium">{r.reference}</TableCell>
                      <TableCell>{r.title}</TableCell>
                      <TableCell>{r.quotes.length}</TableCell>
                      <TableCell><Badge variant={r.status === 'awarded' ? 'default' : 'secondary'}>{r.status}</Badge></TableCell>
                      <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => open(r.id)}>{tr('Open', 'فتح')}</Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </SectionPageShell>
  );
}
