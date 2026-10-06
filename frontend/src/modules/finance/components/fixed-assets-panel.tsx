'use client';

import * as React from 'react';
import { format, subMonths } from 'date-fns';
import { Boxes, MoreHorizontal, PlusCircle, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import type { LedgerAccount } from '@/modules/finance/types';
import { createAsset, deleteAsset, disposeAsset, getAssets, runDepreciation, updateAsset, type FixedAsset } from '@/services/assetService';
import { getLedgerAccounts } from '@/services/financeService';

type Tr = (en: string, ar: string) => string;
const NONE = '__none__';

/**
 * Fixed assets: what the company owns for the long run, what it is worth after
 * depreciation, and the month-end step that posts that depreciation.
 */
export function FixedAssetsPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { money } = useCompanyCurrency();
  const { toast } = useToast();
  const confirm = useConfirm();
  const companyId = selectedCompany?.id ?? '';

  const [assets, setAssets] = React.useState<FixedAsset[]>([]);
  const [accounts, setAccounts] = React.useState<LedgerAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [disposing, setDisposing] = React.useState<FixedAsset | null>(null);
  const [renaming, setRenaming] = React.useState<{ asset: FixedAsset; name: string } | null>(null);
  const [through, setThrough] = React.useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [running, setRunning] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [a, l] = await Promise.all([getAssets(companyId), getLedgerAccounts(companyId)]);
      setAssets(a); setAccounts(l);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load assets', 'تعذّر تحميل الأصول'), description: error?.message });
    } finally { setLoading(false); }
  }, [companyId, toast, tr]);
  React.useEffect(() => { void load(); }, [load]);

  const fixedAccounts = accounts.filter((a) => a.type === 'Asset' && a.detailType === 'Fixed assets');
  const cashAccounts = accounts.filter((a) => a.type === 'Asset' && (a.code === '1000' || a.code === '1010' || a.detailType === 'Bank'));
  const active = assets.filter((a) => a.status === 'active');
  const totals = active.reduce((t, a) => ({ cost: t.cost + a.cost, book: t.book + a.bookValue }), { cost: 0, book: 0 });

  const post = async () => {
    setRunning(true);
    try {
      const result = await runDepreciation(companyId, through);
      const total = result.posted.reduce((s, p) => s + p.amount, 0);
      toast({
        variant: result.skipped.length ? 'destructive' : undefined,
        title: result.posted.length
          ? tr(`Depreciation posted: ${money(total)} over ${result.posted.length} month(s)`, `تم ترحيل الإهلاك: ${money(total)} على ${result.posted.length} شهر`)
          : tr('Nothing to post: every month up to then is done', 'لا شيء للترحيل: كل الأشهر حتى ذلك الحين مُرحّلة'),
        description: result.skipped.length ? tr(`Skipped ${result.skipped.map((s) => s.period).join(', ')}: ${result.skipped[0].reason}`, `تُخطّيت ${result.skipped.map((s) => s.period).join('، ')}: ${result.skipped[0].reason}`) : undefined,
      });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not post depreciation', 'تعذّر ترحيل الإهلاك'), description: error?.message });
    } finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:w-96">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{tr('Cost of assets in use', 'تكلفة الأصول المستخدمة')}</p><p className="text-lg font-semibold tabular-nums">{money(totals.cost)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{tr('Their book value', 'قيمتها الدفترية')}</p><p className="text-lg font-semibold tabular-nums">{money(totals.book)}</p></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="dep-through">{tr('Post depreciation through', 'ترحيل الإهلاك حتى')}</Label>
            <Input id="dep-through" type="month" value={through} max={format(new Date(), 'yyyy-MM')} onChange={(e) => setThrough(e.target.value)} className="w-44" />
          </div>
          <Button variant="secondary" disabled={running || !through || active.length === 0} onClick={post}><TrendingDown className="me-2 h-4 w-4" />{tr('Post', 'ترحيل')}</Button>
          <Button onClick={() => setAdding(true)}><PlusCircle className="me-2 h-4 w-4" />{tr('Register asset', 'تسجيل أصل')}</Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('Asset', 'الأصل')}</TableHead>
              <TableHead>{tr('Bought', 'تاريخ الشراء')}</TableHead>
              <TableHead className="text-end">{tr('Cost', 'التكلفة')}</TableHead>
              <TableHead className="text-end">{tr('Depreciated', 'المُهلك')}</TableHead>
              <TableHead className="text-end">{tr('Book value', 'القيمة الدفترية')}</TableHead>
              <TableHead>{tr('Through', 'حتى')}</TableHead>
              <TableHead className="w-10"><span className="sr-only">{tr('Actions', 'الإجراءات')}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</TableCell></TableRow>
            ) : assets.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                <Boxes className="mx-auto mb-2 h-6 w-6" />{tr('No fixed assets yet: vehicles, machines, furniture, computers.', 'لا توجد أصول ثابتة بعد: مركبات وآلات وأثاث وحواسيب.')}
              </TableCell></TableRow>
            ) : assets.map((a) => (
              <TableRow key={a.id} className={a.status === 'disposed' ? 'opacity-60' : undefined}>
                <TableCell>
                  <div className="font-medium" dir="auto">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.category ? <span dir="auto">{a.category} · </span> : null}
                    {tr(`${money(a.monthly)}/month over ${a.usefulLifeMonths} months`, `${money(a.monthly)} شهرياً على ${a.usefulLifeMonths} شهراً`)}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{a.acquiredOn}</TableCell>
                <TableCell className="text-end tabular-nums">{money(a.cost)}</TableCell>
                <TableCell className="text-end tabular-nums">{money(a.accumulated)}</TableCell>
                <TableCell className="text-end font-medium tabular-nums">{money(a.bookValue)}</TableCell>
                <TableCell>
                  {a.status === 'disposed'
                    ? <Badge variant="secondary">{tr(`Disposed ${a.disposedOn}`, `مستبعد ${a.disposedOn}`)}</Badge>
                    : <span className="tabular-nums">{a.depreciatedThrough ?? '—'}</span>}
                </TableCell>
                <TableCell>
                  {a.status === 'active' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={tr(`Actions for ${a.name}`, `إجراءات ${a.name}`)}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRenaming({ asset: a, name: a.name })}>{tr('Rename', 'إعادة تسمية')}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDisposing(a)}>{tr('Sell or scrap…', 'بيع أو إتلاف…')}</DropdownMenuItem>
                        {!a.acquisitionEntryId && !a.depreciatedThrough && (
                          <DropdownMenuItem className="text-destructive" onClick={async () => {
                            if (!(await confirm({ title: tr(`Delete ${a.name}?`, `حذف ${a.name}؟`), description: tr('Nothing has been posted for it yet.', 'لم يُرحّل له شيء بعد.'), confirmText: tr('Delete', 'حذف'), cancelText: tr('Cancel', 'إلغاء'), destructive: true }))) return;
                            try { await deleteAsset(a.id); await load(); } catch (error: any) { toast({ variant: 'destructive', title: tr('Could not delete', 'تعذّر الحذف'), description: error?.message }); }
                          }}>{tr('Delete', 'حذف')}</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {adding && (
        <RegisterDialog fixedAccounts={fixedAccounts} cashAccounts={cashAccounts} tr={tr} money={money} onClose={() => setAdding(false)} onSave={async (data) => {
          try { await createAsset(companyId, data); toast({ title: tr('Asset registered', 'تم تسجيل الأصل') }); setAdding(false); await load(); }
          catch (error: any) { toast({ variant: 'destructive', title: tr('Could not register', 'تعذّر التسجيل'), description: error?.message }); }
        }} />
      )}
      {renaming && (
        <Dialog open onOpenChange={(o) => { if (!o) setRenaming(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{tr('Rename asset', 'إعادة تسمية الأصل')}</DialogTitle></DialogHeader>
            <Input aria-label={tr('Asset name', 'اسم الأصل')} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenaming(null)}>{tr('Cancel', 'إلغاء')}</Button>
              <Button disabled={renaming.name.trim().length < 2} onClick={async () => {
                try { await updateAsset(renaming.asset.id, { name: renaming.name.trim() }); setRenaming(null); await load(); }
                catch (error: any) { toast({ variant: 'destructive', title: tr('Could not rename', 'تعذّرت إعادة التسمية'), description: error?.message }); }
              }}>{tr('Save', 'حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {disposing && (
        <DisposeDialog asset={disposing} cashAccounts={cashAccounts} tr={tr} money={money} onClose={() => setDisposing(null)} onSave={async (data) => {
          try {
            const done = await disposeAsset(disposing.id, data);
            const result = (done.disposalProceeds ?? 0) - done.bookValue;
            toast({ title: tr(`${done.name} taken off the books`, `أُزيل ${done.name} من الدفاتر`), description: result === 0 ? undefined : result > 0 ? tr(`Gain: ${money(result)}`, `ربح: ${money(result)}`) : tr(`Loss: ${money(-result)}`, `خسارة: ${money(-result)}`) });
            setDisposing(null); await load();
          } catch (error: any) { toast({ variant: 'destructive', title: tr('Could not dispose', 'تعذّر الاستبعاد'), description: error?.message }); }
        }} />
      )}
    </div>
  );
}

function RegisterDialog({ fixedAccounts, cashAccounts, tr, money, onClose, onSave }: {
  fixedAccounts: LedgerAccount[]; cashAccounts: LedgerAccount[]; tr: Tr; money: (n: number) => string;
  onClose: () => void; onSave: (data: Parameters<typeof createAsset>[1]) => Promise<void>;
}) {
  const [f, setF] = React.useState({ name: '', category: '', assetAccountId: fixedAccounts[0]?.id ?? '', paidFrom: NONE, cost: '', salvage: '0', acquiredOn: format(new Date(), 'yyyy-MM-dd'), years: '5' });
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const cost = Number(f.cost) || 0;
  const salvage = Number(f.salvage) || 0;
  const months = Math.round((Number(f.years) || 0) * 12);
  const monthly = months > 0 && cost > salvage ? (cost - salvage) / months : 0;
  const valid = f.name.trim().length >= 2 && f.assetAccountId && cost > 0 && salvage < cost && months > 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tr('Register a fixed asset', 'تسجيل أصل ثابت')}</DialogTitle>
          <DialogDescription>{tr('Something the company will use for more than a year. Its cost is spread over its useful life as depreciation.', 'شيء ستستخدمه الشركة لأكثر من عام. تُوزّع تكلفته على عمره الإنتاجي كإهلاك.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="as-name">{tr('Name', 'الاسم')}</Label><Input id="as-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={tr('e.g. Delivery van', 'مثال: شاحنة توصيل')} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-cat">{tr('Category (optional)', 'الفئة (اختياري)')}</Label><Input id="as-cat" value={f.category} onChange={(e) => set({ category: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>{tr('Asset account', 'حساب الأصل')}</Label>
            <Select value={f.assetAccountId} onValueChange={(v) => set({ assetAccountId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{fixedAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="as-cost">{tr('Cost', 'التكلفة')}</Label><Input id="as-cost" type="number" min={0} step="any" value={f.cost} onChange={(e) => set({ cost: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-salvage">{tr('Worth at the end (salvage)', 'القيمة في النهاية (الخردة)')}</Label><Input id="as-salvage" type="number" min={0} step="any" value={f.salvage} onChange={(e) => set({ salvage: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-date">{tr('Bought on', 'تاريخ الشراء')}</Label><Input id="as-date" type="date" value={f.acquiredOn} onChange={(e) => set({ acquiredOn: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="as-years">{tr('Useful life (years)', 'العمر الإنتاجي (سنوات)')}</Label><Input id="as-years" type="number" min={0.1} step="0.5" value={f.years} onChange={(e) => set({ years: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tr('Paid from', 'دُفع من')}</Label>
            <Select value={f.paidFrom} onValueChange={(v) => set({ paidFrom: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{tr('Already in the books (e.g. through a supplier bill)', 'مسجّل في الدفاتر (مثلاً عبر فاتورة مورّد)')}</SelectItem>
                {cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">{monthly > 0 ? tr(`Depreciation: ${money(monthly)} a month`, `الإهلاك: ${money(monthly)} شهرياً`) : ' '}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
            <Button disabled={!valid || saving} onClick={async () => {
              setSaving(true);
              try {
                await onSave({ name: f.name.trim(), category: f.category.trim() || undefined, assetAccountId: f.assetAccountId, paidFromAccountId: f.paidFrom === NONE ? undefined : f.paidFrom, cost, salvageValue: salvage, acquiredOn: f.acquiredOn, usefulLifeMonths: months });
              } finally { setSaving(false); }
            }}>{tr('Register', 'تسجيل')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({ asset, cashAccounts, tr, money, onClose, onSave }: {
  asset: FixedAsset; cashAccounts: LedgerAccount[]; tr: Tr; money: (n: number) => string;
  onClose: () => void; onSave: (data: { disposedOn: string; proceeds: number; depositAccountId?: string }) => Promise<void>;
}) {
  const [disposedOn, setDisposedOn] = React.useState(format(new Date(), 'yyyy-MM-dd'));
  const [proceeds, setProceeds] = React.useState('0');
  const [deposit, setDeposit] = React.useState(cashAccounts.find((a) => a.code === '1010')?.id ?? cashAccounts[0]?.id ?? '');
  const [saving, setSaving] = React.useState(false);
  const amount = Number(proceeds) || 0;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr(`Sell or scrap ${asset.name}`, `بيع أو إتلاف ${asset.name}`)}</DialogTitle>
          <DialogDescription>{tr('Depreciation is brought up to the month before. Selling above book value is a gain, below it a loss. Scrapping is a sale for nothing.', 'يُرحّل الإهلاك حتى الشهر السابق. البيع فوق القيمة الدفترية ربح، ودونها خسارة. والإتلاف بيع بلا مقابل.')}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">{tr('Book value now:', 'القيمة الدفترية الآن:')} <span className="font-semibold tabular-nums">{money(asset.bookValue)}</span> <span className="text-xs text-muted-foreground">{tr('(before this month’s catch-up)', '(قبل ترحيل الأشهر المتبقية)')}</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="dp-date">{tr('Date', 'التاريخ')}</Label><Input id="dp-date" type="date" value={disposedOn} min={asset.acquiredOn} onChange={(e) => setDisposedOn(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="dp-amount">{tr('Sold for', 'سعر البيع')}</Label><Input id="dp-amount" type="number" min={0} step="any" value={proceeds} onChange={(e) => setProceeds(e.target.value)} /></div>
          {amount > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{tr('Paid into', 'أودع في')}</Label>
              <Select value={deposit} onValueChange={setDeposit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button variant="destructive" disabled={saving} onClick={async () => {
            setSaving(true);
            try { await onSave({ disposedOn, proceeds: amount, depositAccountId: amount > 0 ? deposit : undefined }); } finally { setSaving(false); }
          }}>{tr('Take off the books', 'إزالة من الدفاتر')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
