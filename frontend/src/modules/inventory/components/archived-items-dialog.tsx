'use client';

import * as React from 'react';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { InventoryItem } from '@/modules/operations/types';
import { getArchivedInventoryItems, restoreInventoryItem } from '@/services/operationsService';

/** Items removed while records still named them; each can be brought back. */
export function ArchivedItemsDialog({ companyId, canManage, onRestored }: { companyId: string; canManage: boolean; onRestored: () => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<InventoryItem[] | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems(await getArchivedInventoryItems(companyId));
    } catch (error: any) {
      setItems([]);
      toast({ variant: 'destructive', title: tr('Could not load archived items', 'تعذر تحميل الأصناف المؤرشفة'), description: error?.message });
    }
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { if (open) load(); }, [open, load]);

  const restore = async (item: InventoryItem) => {
    try {
      await restoreInventoryItem(item.id);
      toast({ title: tr(`${item.name} is back in inventory`, `أُعيد ${item.name} إلى المخزون`) });
      await load();
      onRestored();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not restore the item', 'تعذر استعادة الصنف'), description: error?.message });
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Archive className="me-2 h-4 w-4" />{tr('Archived', 'المؤرشفة')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr('Archived items', 'الأصناف المؤرشفة')}</DialogTitle>
            <DialogDescription>
              {tr(
                'Removed items that past orders, deliveries or stock movements still name. They stay out of pickers until restored.',
                'أصناف أُزيلت لكن طلبات أو تسليمات أو حركات مخزون سابقة ما زالت تشير إليها. لا تظهر في القوائم حتى تُستعاد.',
              )}
            </DialogDescription>
          </DialogHeader>
          {items === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{tr('Nothing is archived.', 'لا توجد أصناف مؤرشفة.')}</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr('SKU', 'الرمز')}</TableHead>
                    <TableHead>{tr('Item', 'الصنف')}</TableHead>
                    <TableHead>{tr('Archived on', 'تاريخ الأرشفة')}</TableHead>
                    <TableHead className="text-end"><span className="sr-only">{tr('Actions', 'إجراءات')}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs"><bdi>{item.sku}</bdi></TableCell>
                      <TableCell><bdi>{item.name}</bdi></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.archivedAt ? new Date(item.archivedAt).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB') : '—'}
                      </TableCell>
                      <TableCell className="text-end">
                        {canManage && <Button size="sm" variant="outline" onClick={() => restore(item)}>{tr('Restore', 'استعادة')}</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
