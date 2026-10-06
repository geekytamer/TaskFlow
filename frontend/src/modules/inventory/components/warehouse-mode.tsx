'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Camera, ClipboardCheck, PackageCheck, PackageSearch, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { InventoryItem, InventoryLot, InventoryLocationBalance, PurchaseOrder } from '@/modules/operations/types';
import {
  createStockCount, getInventoryItems, getInventoryLocationBalances, getInventoryLots, getPurchaseOrders, getPurchaseReceipts,
  getStockCount, getStockCounts, postStockCount, receivePurchaseOrder, saveStockCount, type StockCount,
} from '@/services/operationsService';
import { lotStatusLabel } from './lot-quality';

type Tr = (en: string, ar: string) => string;
type Mode = 'home' | 'lookup' | 'receive' | 'count';

/** Finds the item a scan or a typed word means: barcode or SKU exactly, otherwise a name containing it. */
function findItem(items: InventoryItem[], code: string): InventoryItem | undefined {
  const q = code.trim().toLowerCase();
  if (!q) return undefined;
  return items.find((i) => i.barcode?.toLowerCase() === q || i.sku.toLowerCase() === q)
    ?? items.find((i) => i.name.toLowerCase().includes(q));
}

/**
 * Warehouse mode: the jobs done standing at a shelf, on a phone. Scan with
 * the camera where the browser can read barcodes, with a scanner gun (it
 * types and presses Enter), or by typing.
 */
export function WarehouseMode() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const [mode, setMode] = React.useState<Mode>('home');
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const companyId = selectedCompany?.id ?? '';

  React.useEffect(() => { if (companyId) getInventoryItems(companyId).then(setItems).catch(() => setItems([])); }, [companyId]);

  const tiles: Array<{ mode: Mode; icon: React.ComponentType<{ className?: string }>; en: string; ar: string; hintEn: string; hintAr: string }> = [
    { mode: 'lookup', icon: PackageSearch, en: 'Look up', ar: 'استعلام', hintEn: 'Stock, places and batches of an item', hintAr: 'مخزون الصنف وأماكنه ودفعاته' },
    { mode: 'receive', icon: PackageCheck, en: 'Receive', ar: 'استلام', hintEn: 'Goods arriving on a purchase order', hintAr: 'بضاعة واصلة على أمر شراء' },
    { mode: 'count', icon: ClipboardCheck, en: 'Count', ar: 'جرد', hintEn: 'Count the shelves', hintAr: 'اعدد الرفوف' },
  ];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pb-24">
      <header className="flex items-center gap-2">
        {mode !== 'home' && <Button variant="ghost" size="icon" aria-label={tr('Back', 'رجوع')} onClick={() => setMode('home')}><ArrowLeft className="h-5 w-5 rtl:rotate-180" /></Button>}
        <h1 className="text-2xl font-bold font-headline">{mode === 'home' ? tr('Warehouse', 'المستودع') : tiles.find((t) => t.mode === mode) ? tr(tiles.find((t) => t.mode === mode)!.en, tiles.find((t) => t.mode === mode)!.ar) : ''}</h1>
      </header>
      {mode === 'home' && (
        <div className="grid gap-3">
          {tiles.map((t) => (
            <button key={t.mode} type="button" onClick={() => setMode(t.mode)} className="flex items-center gap-4 rounded-xl border bg-card p-5 text-start shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <t.icon className="h-8 w-8 text-primary" />
              <span>
                <span className="block text-lg font-semibold">{tr(t.en, t.ar)}</span>
                <span className="block text-sm text-muted-foreground">{tr(t.hintEn, t.hintAr)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {mode === 'lookup' && <LookUp companyId={companyId} items={items} tr={tr} />}
      {mode === 'receive' && <Receive companyId={companyId} items={items} tr={tr} onDone={() => setMode('home')} />}
      {mode === 'count' && <Count companyId={companyId} items={items} tr={tr} onDone={() => setMode('home')} />}
    </div>
  );
}

/** A scan box that takes a scanner gun (types, then Enter), typing, or the camera where supported. */
function ScanBox({ onScan, tr, placeholder }: { onScan: (code: string) => void; tr: Tr; placeholder?: string }) {
  const [value, setValue] = React.useState('');
  const [camera, setCamera] = React.useState(false);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const submit = (code: string) => { if (code.trim()) { onScan(code.trim()); setValue(''); inputRef.current?.focus(); } };
  return (
    <div className="sticky top-0 z-10 space-y-2 bg-background pb-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(value); }}>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputRef} autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="h-12 ps-10 text-base" inputMode="search" enterKeyHint="search"
            placeholder={placeholder ?? tr('Scan or type a barcode, SKU or name', 'امسح أو اكتب الباركود أو الرمز أو الاسم')} aria-label={tr('Scan', 'مسح')} />
        </div>
        {supported && <Button type="button" variant={camera ? 'default' : 'outline'} className="h-12 w-12" size="icon" aria-label={tr('Scan with the camera', 'المسح بالكاميرا')} onClick={() => setCamera((c) => !c)}><Camera className="h-5 w-5" /></Button>}
      </form>
      {camera && <CameraScanner onScan={(code) => { setCamera(false); submit(code); }} onClose={() => setCamera(false)} tr={tr} />}
    </div>
  );
}

function CameraScanner({ onScan, onClose, tr }: { onScan: (code: string) => void; onClose: () => void; tr: Tr }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'] });
        timer = window.setInterval(async () => {
          if (!videoRef.current) return;
          const found = await detector.detect(videoRef.current).catch(() => []);
          if (found[0]?.rawValue) onScan(found[0].rawValue);
        }, 300);
      } catch {
        setError(tr('The camera is not available. Use a scanner or type the code.', 'الكاميرا غير متاحة. استخدم الماسح أو اكتب الرمز.'));
      }
    })();
    return () => { stopped = true; window.clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative overflow-hidden rounded-lg border bg-black">
      {error ? <p className="p-4 text-sm text-white">{error}</p> : <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />}
      <Button type="button" size="icon" variant="secondary" className="absolute end-2 top-2" aria-label={tr('Close the camera', 'إغلاق الكاميرا')} onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
  );
}

function LookUp({ companyId, items, tr }: { companyId: string; items: InventoryItem[]; tr: Tr }) {
  const { toast } = useToast();
  const [item, setItem] = React.useState<InventoryItem | null>(null);
  const [balances, setBalances] = React.useState<InventoryLocationBalance[]>([]);
  const [lots, setLots] = React.useState<InventoryLot[]>([]);
  const scan = async (code: string) => {
    const found = findItem(items, code);
    if (!found) { toast({ variant: 'destructive', title: tr(`Nothing matches “${code}”`, `لا شيء يطابق «${code}»`) }); return; }
    setItem(found);
    const [b, l] = await Promise.all([getInventoryLocationBalances(companyId, found.id).catch(() => []), getInventoryLots(companyId, found.id).catch(() => [])]);
    setBalances(b.filter((x) => x.quantity !== 0));
    setLots(l.filter((x) => x.quantity > 0));
  };
  return (
    <>
      <ScanBox onScan={scan} tr={tr} />
      {item && (
        <section className="space-y-3 rounded-xl border p-4">
          <div>
            <p className="text-lg font-semibold" dir="auto">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.sku}{item.barcode ? ` · ${item.barcode}` : ''}</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">{item.onHand} <span className="text-base font-normal text-muted-foreground">{item.unit}</span></p>
          {balances.length > 0 && (
            <ul className="divide-y rounded-md border text-sm">
              {balances.map((b) => <li key={b.location} className="flex justify-between px-3 py-2"><span dir="auto">{b.location}</span><span className="tabular-nums font-medium">{b.quantity}</span></li>)}
            </ul>
          )}
          {lots.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold">{tr('Batches', 'الدفعات')}</p>
              <ul className="divide-y rounded-md border text-sm">
                {lots.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{l.lotNumber}</span>
                    <span className="text-muted-foreground">{l.expiryDate ? format(new Date(l.expiryDate), 'dd MMM yyyy') : '—'}</span>
                    <span className={cn('text-xs', l.status === 'Quarantine' && 'text-amber-700 dark:text-amber-400', l.status === 'Rejected' && 'text-destructive')}>{lotStatusLabel(l.status, tr)}</span>
                    <span className="tabular-nums">{l.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function Receive({ companyId, items, tr, onDone }: { companyId: string; items: InventoryItem[]; tr: Tr; onDone: () => void }) {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<PurchaseOrder[] | null>(null);
  const [order, setOrder] = React.useState<PurchaseOrder | null>(null);
  const [remaining, setRemaining] = React.useState<number[]>([]);
  const [lines, setLines] = React.useState<Array<{ qty: string; lot: string; expiry: string }>>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getPurchaseOrders(companyId).then((all) => setOrders(all.filter((o) => (o.status === 'Ordered' || o.status === 'Partially Received') && o.approvalStatus !== 'pending' && o.approvalStatus !== 'rejected'))).catch(() => setOrders([]));
  }, [companyId]);

  const open = async (o: PurchaseOrder) => {
    const receipts = await getPurchaseReceipts(companyId, o.id).catch(() => []);
    const got = o.items.map((_, i) => receipts.flatMap((r) => r.items ?? []).filter((l) => l.lineIndex === i).reduce((s, l) => s + l.quantity, 0));
    setRemaining(o.items.map((line, i) => Math.max(0, line.quantity - got[i])));
    setLines(o.items.map(() => ({ qty: '', lot: '', expiry: '' })));
    setOrder(o);
  };
  const scan = (code: string) => {
    if (!order) return;
    const item = findItem(items, code);
    const index = item ? order.items.findIndex((l) => l.inventoryItemId === item.id) : -1;
    if (index < 0) { toast({ variant: 'destructive', title: tr('Not on this order', 'ليس على هذا الأمر') }); return; }
    setLines((x) => x.map((l, i) => (i === index ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l)));
  };

  if (!order) {
    return orders === null ? <p className="text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : orders.length === 0 ? (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{tr('Nothing is on its way.', 'لا شيء في الطريق.')}</p>
    ) : (
      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => open(o)} className="flex w-full items-center justify-between rounded-xl border p-4 text-start hover:bg-accent">
              <span><span className="block font-semibold">{o.orderNumber}</span><span className="block text-sm text-muted-foreground" dir="auto">{o.supplierName}</span></span>
              <span className="text-sm text-muted-foreground">{o.items.length} {tr('lines', 'بنود')}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const toReceive = lines.map((l, i) => ({ lineIndex: i, quantity: Number(l.qty) || 0, lotNumber: l.lot.trim() || undefined, expiryDate: l.expiry || undefined })).filter((l) => l.quantity > 0);
  const over = lines.some((l, i) => (Number(l.qty) || 0) > remaining[i] + 0.0001);
  return (
    <>
      <ScanBox onScan={scan} tr={tr} placeholder={tr('Scan each item as it comes off the truck', 'امسح كل صنف عند إنزاله')} />
      <p className="text-sm text-muted-foreground">{order.orderNumber} · <span dir="auto">{order.supplierName}</span></p>
      <ul className="space-y-3">
        {order.items.map((line, i) => (
          <li key={i} className={cn('space-y-2 rounded-xl border p-3', (Number(lines[i]?.qty) || 0) > remaining[i] && 'border-destructive')}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium" dir="auto">{line.description}</span>
              <span className="text-sm text-muted-foreground">{tr(`${remaining[i]} to come`, `${remaining[i]} متبقٍ`)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input inputMode="decimal" className="h-11" placeholder={tr('Qty', 'الكمية')} aria-label={tr(`Quantity of ${line.description}`, `كمية ${line.description}`)} value={lines[i]?.qty ?? ''} onChange={(e) => setLines((x) => x.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))} />
              <Input className="h-11" placeholder={tr('Batch', 'الدفعة')} aria-label={tr(`Batch of ${line.description}`, `دفعة ${line.description}`)} value={lines[i]?.lot ?? ''} onChange={(e) => setLines((x) => x.map((l, j) => (j === i ? { ...l, lot: e.target.value } : l)))} />
              <Input type="date" className="h-11" aria-label={tr(`Expiry of ${line.description}`, `انتهاء ${line.description}`)} value={lines[i]?.expiry ?? ''} onChange={(e) => setLines((x) => x.map((l, j) => (j === i ? { ...l, expiry: e.target.value } : l)))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
        <div className="mx-auto flex max-w-md gap-2">
          <Button variant="outline" className="h-12" onClick={() => setOrder(null)}>{tr('Other order', 'أمر آخر')}</Button>
          <Button className="h-12 flex-1" disabled={saving || toReceive.length === 0 || over} onClick={async () => {
            setSaving(true);
            try {
              await receivePurchaseOrder(order.id, { items: toReceive });
              toast({ title: tr(`${toReceive.reduce((s, l) => s + l.quantity, 0)} units received`, `تم استلام ${toReceive.reduce((s, l) => s + l.quantity, 0)} وحدة`) });
              onDone();
            } catch (error: any) {
              toast({ variant: 'destructive', title: tr('Could not receive', 'تعذّر الاستلام'), description: error?.message });
            } finally { setSaving(false); }
          }}>{over ? tr('More than ordered', 'أكثر من المطلوب') : tr('Receive', 'استلام')}</Button>
        </div>
      </div>
    </>
  );
}

function Count({ companyId, items, tr, onDone }: { companyId: string; items: InventoryItem[]; tr: Tr; onDone: () => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [count, setCount] = React.useState<StockCount | null>(null);
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [last, setLast] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    getStockCounts(companyId).then(async (all) => {
      const open = all.find((c) => c.status === 'draft');
      const c = open ? await getStockCount(open.id) : null;
      if (c) { setCount(c); setQty(Object.fromEntries(c.lines.filter((l) => l.countedQty !== null).map((l) => [l.id, String(l.countedQty)]))); }
    }).catch(() => undefined);
  }, [companyId]);

  const save = async (next: Record<string, string>) => {
    if (!count) return;
    try {
      setCount(await saveStockCount(count.id, Object.entries(next).map(([lineId, v]) => ({ lineId, countedQty: v === '' ? null : Number(v) }))));
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save the count', 'تعذّر حفظ الجرد'), description: error?.message });
    }
  };
  const scan = (code: string) => {
    if (!count) return;
    const item = findItem(items, code);
    const line = item ? count.lines.find((l) => l.inventoryItemId === item.id) : undefined;
    if (!line) { toast({ variant: 'destructive', title: tr('Not in this count', 'ليس في هذا الجرد') }); return; }
    const next = { ...qty, [line.id]: String((Number(qty[line.id]) || 0) + 1) };
    setQty(next);
    setLast(line.id);
    void save(next);
  };

  if (!count) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-muted-foreground">{tr('No count is open. Start one: it takes a snapshot of what the system thinks is on the shelves.', 'لا يوجد جرد مفتوح. ابدأ جرداً: يأخذ لقطة لما يظنه النظام على الرفوف.')}</p>
        <Button className="h-12 w-full" disabled={busy} onClick={async () => {
          setBusy(true);
          try { setCount(await createStockCount(companyId, tr('Counted on the warehouse floor', 'جرد من أرض المستودع'))); } catch (error: any) { toast({ variant: 'destructive', title: tr('Could not start', 'تعذّر البدء'), description: error?.message }); } finally { setBusy(false); }
        }}>{tr('Start a count', 'بدء جرد')}</Button>
      </div>
    );
  }

  const counted = count.lines.filter((l) => qty[l.id] !== undefined && qty[l.id] !== '').length;
  const lines = [...count.lines].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));
  return (
    <>
      <ScanBox onScan={scan} tr={tr} placeholder={tr('Scan each item you count', 'امسح كل صنف تعدّه')} />
      <p className="text-sm text-muted-foreground">{count.reference} · {tr(`${counted} of ${count.lines.length} counted`, `عُدّ ${counted} من ${count.lines.length}`)}</p>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className={cn('flex items-center gap-3 rounded-xl border p-3', l.id === last && 'border-primary')}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium" dir="auto">{l.name}</span>
              <span className="block text-xs text-muted-foreground">{l.sku} · {tr(`system ${l.systemQty}`, `النظام ${l.systemQty}`)}</span>
            </span>
            <Input inputMode="decimal" className="h-11 w-24 text-center text-lg" aria-label={tr(`Counted ${l.name}`, `المعدود من ${l.name}`)} value={qty[l.id] ?? ''}
              onChange={(e) => setQty((x) => ({ ...x, [l.id]: e.target.value }))} onBlur={() => save(qty)} />
          </li>
        ))}
      </ul>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
        <div className="mx-auto max-w-md">
          <Button className="h-12 w-full" disabled={busy || counted === 0} onClick={async () => {
            if (!(await confirm({ title: tr('Post this count?', 'ترحيل هذا الجرد؟'), description: tr('Stock moves to what you counted, and the difference is booked. Lines you left empty are not changed.', 'يصبح المخزون مساوياً لما عددته، ويُسجّل الفرق. البنود الفارغة لا تتغير.'), confirmText: tr('Post', 'ترحيل'), cancelText: tr('Keep counting', 'متابعة الجرد') }))) return;
            setBusy(true);
            try { await save(qty); await postStockCount(count.id); toast({ title: tr('Count posted', 'تم ترحيل الجرد') }); onDone(); }
            catch (error: any) { toast({ variant: 'destructive', title: tr('Could not post', 'تعذّر الترحيل'), description: error?.message }); }
            finally { setBusy(false); }
          }}>{tr('Post the count', 'ترحيل الجرد')}</Button>
        </div>
      </div>
    </>
  );
}
