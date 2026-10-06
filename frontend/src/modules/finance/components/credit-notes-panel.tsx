'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissionOr } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import { deleteCreditNote, getCreditNotes, getInvoices } from '@/services/financeService';
import type { CreditNote } from '@/modules/finance/types';
import { FileMinus, Trash2 } from 'lucide-react';

/**
 * Every credit note the company issued, with the invoice it corrects. Credit
 * notes are created from an invoice's actions; this is where they are found
 * again and, when issued by mistake, deleted (which removes their ledger entries).
 */
export function CreditNotesPanel({ version = 0 }: { version?: number }) {
  const { selectedCompany, currentRole } = useCompany();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { amount } = useCompanyCurrency();
  const { toast } = useToast();
  const confirm = useConfirm();
  const canManage = usePermissionOr('invoices', 'delete', currentRole === 'Admin' || currentRole === 'Manager' || currentRole === 'Accountant');
  const [notes, setNotes] = React.useState<CreditNote[] | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = React.useState<Map<string, string>>(new Map());

  const load = React.useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const [list, invoices] = await Promise.all([getCreditNotes(selectedCompany.id), getInvoices(selectedCompany.id)]);
      setNotes([...list].sort((a, b) => +b.issueDate - +a.issueDate));
      setInvoiceNumbers(new Map(invoices.map((i) => [i.id, i.invoiceNumber])));
    } catch (error: any) {
      setNotes([]);
      toast({ variant: 'destructive', title: tr('Credit notes unavailable', 'إشعارات الدائن غير متاحة'), description: error?.message });
    }
  }, [selectedCompany, toast, tr]);

  React.useEffect(() => { void load(); }, [load, version]);

  const handleDelete = async (note: CreditNote) => {
    const ok = await confirm({
      title: tr(`Delete credit note ${note.creditNoteNumber}?`, `حذف إشعار الدائن ${note.creditNoteNumber}؟`),
      description: tr(
        'Its ledger entries are removed and the invoice it credited owes the full amount again. Notes in a locked period cannot be deleted.',
        'تُحذف قيوده من الدفتر وتعود الفاتورة المرتبطة مستحقة بالكامل. لا يمكن حذف إشعار ضمن فترة مقفلة.',
      ),
      confirmText: tr('Delete', 'حذف'),
      cancelText: tr('Cancel', 'إلغاء'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCreditNote(note.id);
      toast({ title: tr('Credit note deleted', 'تم حذف إشعار الدائن') });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete', 'تعذر الحذف'), description: error?.message });
    }
  };

  const total = (notes ?? []).filter((n) => n.status === 'Issued').reduce((sum, n) => sum + n.total, 0);
  const cols = canManage ? 7 : 6;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileMinus className="h-4 w-4 text-muted-foreground" />
          {tr('Credit notes', 'إشعارات الدائن')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {tr('Issue a credit note from an invoice’s actions. Issued total: ', 'أصدر إشعار دائن من إجراءات الفاتورة. إجمالي الصادر: ')}
          <span className="font-semibold tabular-nums text-foreground">{amount(total)}</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>{tr('Number', 'الرقم')}</TableHead>
                <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                <TableHead>{tr('Invoice', 'الفاتورة')}</TableHead>
                <TableHead>{tr('Reason', 'السبب')}</TableHead>
                <TableHead>{tr('Status', 'الحالة')}</TableHead>
                <TableHead className="text-end">{tr('Amount', 'المبلغ')}</TableHead>
                {canManage && <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes === null && Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: cols }).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>)}</TableRow>
              ))}
              {notes?.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium" dir="ltr">{n.creditNoteNumber}</TableCell>
                  <TableCell>{format(n.issueDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell dir="ltr">{n.invoiceId ? invoiceNumbers.get(n.invoiceId) ?? '—' : '—'}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-muted-foreground" dir="auto">{n.reason || '—'}</TableCell>
                  <TableCell><Badge variant={n.status === 'Issued' ? 'secondary' : 'outline'}>{n.status === 'Issued' ? tr('Issued', 'صادر') : tr('Void', 'ملغى')}</Badge></TableCell>
                  <TableCell className="text-end tabular-nums">{amount(n.total)}</TableCell>
                  {canManage && (
                    <TableCell className="text-end">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(n)} aria-label={tr('Delete', 'حذف')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {notes?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={cols} className="h-20 text-center text-muted-foreground">
                    {tr('No credit notes yet.', 'لا توجد إشعارات دائن بعد.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
