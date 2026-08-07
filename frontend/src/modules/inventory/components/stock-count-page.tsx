'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getStockCounts, getStockCount, createStockCount, saveStockCount,
  postStockCount, deleteStockCount, type StockCount,
} from '@/services/operationsService';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, ArrowLeft, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function CountDetail({ count, onBack, onChanged }: {
  count: StockCount; onBack: () => void; onChanged: () => void;
}) {
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [lines, setLines] = React.useState(count.lines);
  const [saving, setSaving] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const posted = count.status === 'posted';

  const setCounted = (lineId: string, value: string) => {
    const qty = value === '' ? null : Number(value);
    setLines((p) => p.map((l) => l.id === lineId
      ? { ...l, countedQty: qty, variance: qty === null ? 0 : Number((qty - l.systemQty).toFixed(3)) }
      : l));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveStockCount(count.id, lines.map((l) => ({ lineId: l.id, countedQty: l.countedQty })));
      toast({ title: tr('Count saved', 'تم حفظ الجرد') });
      onChanged();
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setSaving(false); }
  };

  const post = async () => {
    const ok = await confirm({
      title: tr('Post this count?', 'ترحيل هذا الجرد؟'),
      description: tr('On-hand quantities will be adjusted to match the counted values. This cannot be undone.',
                      'سيتم تعديل كميات المخزون لتطابق القيم المجرودة. لا يمكن التراجع.'),
      confirmText: tr('Post', 'ترحيل'),
    });
    if (!ok) return;
    setPosting(true);
    try {
      await saveStockCount(count.id, lines.map((l) => ({ lineId: l.id, countedQty: l.countedQty })));
      await postStockCount(count.id);
      toast({ title: tr('Count posted', 'تم ترحيل الجرد') });
      onBack();
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setPosting(false); }
  };

  const countedLines = lines.filter((l) => l.countedQty !== null);
  const withVariance = countedLines.filter((l) => Math.abs(l.variance) > 0.0001).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-2 h-4 w-4" />{tr('Back', 'رجوع')}</Button>
          <div>
            <h3 className="text-lg font-semibold">{count.reference}</h3>
            <p className="text-sm text-muted-foreground">
              {countedLines.length}/{lines.length} {tr('counted', 'مجرود')} · {withVariance} {tr('with variance', 'باختلاف')}
            </p>
          </div>
        </div>
        {!posted && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={save} disabled={saving}>{tr('Save', 'حفظ')}</Button>
            <Button onClick={post} disabled={posting}>
              <CheckCircle2 className="me-2 h-4 w-4" />{tr('Post count', 'ترحيل الجرد')}
            </Button>
          </div>
        )}
        {posted && <Badge>{tr('Posted', 'مُرحّل')}</Badge>}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Item', 'الصنف')}</TableHead>
              <TableHead className="text-end">{tr('System', 'النظام')}</TableHead>
              <TableHead className="w-[140px] text-end">{tr('Counted', 'المجرود')}</TableHead>
              <TableHead className="text-end">{tr('Variance', 'الفرق')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.sku} · {l.unit}</div>
                </TableCell>
                <TableCell className="text-end tabular-nums">{l.systemQty}</TableCell>
                <TableCell className="text-end">
                  <Input
                    type="number" className="w-28 text-end ms-auto"
                    value={l.countedQty ?? ''} disabled={posted}
                    onChange={(e) => setCounted(l.id, e.target.value)}
                  />
                </TableCell>
                <TableCell className={cn('text-end tabular-nums font-medium',
                  l.countedQty === null ? 'text-muted-foreground'
                    : l.variance < 0 ? 'text-red-600' : l.variance > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {l.countedQty === null ? '—' : l.variance > 0 ? `+${l.variance}` : l.variance}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function StockCountPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [counts, setCounts] = React.useState<StockCount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<StockCount | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try { setCounts(await getStockCounts(companyId)); }
    catch { setCounts([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    try { setActive(await getStockCount(id)); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const create = async () => {
    if (!companyId) return;
    setCreating(true);
    try {
      const c = await createStockCount(companyId);
      setActive(c);
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message || tr('Could not open a count.', 'تعذر فتح جرد.') });
    } finally { setCreating(false); }
  };

  const remove = async (id: string) => {
    const ok = await confirm({ title: tr('Delete count?', 'حذف الجرد؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteStockCount(id); load(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  return (
    <SectionPageShell
      title={tr('Cycle Counts', 'جرد المخزون')}
      description={tr('Count physical stock and post adjustments to reconcile on-hand quantities.',
                      'اجرد المخزون الفعلي ورحّل التعديلات لمطابقة الكميات.')}
    >
      {active ? (
        <CountDetail
          count={active}
          onBack={() => { setActive(null); load(); }}
          onChanged={() => open(active.id)}
        />
      ) : loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button data-tutorial="count-create" onClick={create} disabled={creating}>
              <Plus className="me-2 h-4 w-4" />{creating ? tr('Opening…', 'جارٍ الفتح…') : tr('New count', 'جرد جديد')}
            </Button>
          </div>
          {counts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
              <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tr('No stock counts yet.', 'لا توجد عمليات جرد بعد.')}</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('Reference', 'المرجع')}</TableHead>
                    <TableHead>{tr('Items', 'الأصناف')}</TableHead>
                    <TableHead>{tr('Status', 'الحالة')}</TableHead>
                    <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => open(c.id)}>
                      <TableCell className="font-medium">{c.reference}</TableCell>
                      <TableCell>{c.lines.length}</TableCell>
                      <TableCell><Badge variant={c.status === 'posted' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell>
                      <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => open(c.id)}>{tr('Open', 'فتح')}</Button>
                        {c.status !== 'posted' && (
                          <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                        )}
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
