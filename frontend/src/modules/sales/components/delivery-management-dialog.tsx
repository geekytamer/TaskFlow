'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCurrency } from '@/lib/currency';
import type {
  Delivery,
  DeliveryStatus,
  SalesOrder,
} from '@/modules/finance/types';
import {
  cancelDelivery,
  createDelivery,
  getDeliveriesForSalesOrder,
  updateDeliveryStatus,
} from '@/services/financeService';
import { PackageCheck, Truck, X } from 'lucide-react';

const statusStyles: Record<DeliveryStatus, string> = {
  Pending: 'bg-slate-100 text-slate-700 border-slate-200',
  Shipped: 'bg-blue-100 text-blue-700 border-blue-200',
  Delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

type LineFormRow = {
  enabled: boolean;
  quantity: string;
};

interface DeliveryManagementDialogProps {
  order: SalesOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function DeliveryManagementDialog({
  order,
  open,
  onOpenChange,
  onChanged,
}: DeliveryManagementDialogProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { amount } = useCompanyCurrency();
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [carrier, setCarrier] = React.useState('');
  const [trackingNumber, setTrackingNumber] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [scheduledFor, setScheduledFor] = React.useState('');
  const [lineForms, setLineForms] = React.useState<LineFormRow[]>([]);

  const remainingByLine = React.useMemo(() => {
    if (!order) return [] as number[];
    return order.items.map((item, idx) => {
      const delivered = order.deliveredQuantityByLine?.[idx] || 0;
      return Number((item.quantity - delivered).toFixed(4));
    });
  }, [order]);

  const resetForm = React.useCallback(() => {
    setCarrier('');
    setTrackingNumber('');
    setNotes('');
    setScheduledFor('');
    if (order) {
      setLineForms(
        order.items.map((_, idx) => {
          const remaining = Number((order.items[idx].quantity - (order.deliveredQuantityByLine?.[idx] || 0)).toFixed(4));
          return {
            enabled: remaining > 0,
            quantity: remaining > 0 ? String(remaining) : '0',
          };
        }),
      );
    } else {
      setLineForms([]);
    }
  }, [order]);

  const load = React.useCallback(async () => {
    if (!order) return;
    setLoading(true);
    try {
      const list = await getDeliveriesForSalesOrder(order.id);
      setDeliveries(list);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('deliveries.loadFailedTitle'),
        description: error?.message || t('deliveries.loadFailedDescription'),
      });
    } finally {
      setLoading(false);
    }
  }, [order, toast, t]);

  React.useEffect(() => {
    if (open && order) {
      load();
      resetForm();
    }
  }, [open, order, load, resetForm]);

  const totalRemaining = React.useMemo(
    () => remainingByLine.reduce((sum, r) => sum + r, 0),
    [remainingByLine],
  );

  const allFulfilled = totalRemaining <= 0.0001;

  const handleCreate = async () => {
    if (!order) return;
    const items = lineForms
      .map((row, idx) => ({
        salesOrderLineIndex: idx,
        quantity: row.enabled ? Number(row.quantity) : 0,
      }))
      .filter((row) => row.quantity > 0);

    if (!items.length) {
      toast({
        variant: 'destructive',
        title: t('deliveries.noQtyTitle'),
        description: t('deliveries.noQtyDescription'),
      });
      return;
    }

    setSubmitting(true);
    try {
      await createDelivery(order.id, {
        items,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      });
      toast({ title: t('deliveries.createdToast') });
      await load();
      resetForm();
      onChanged?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('deliveries.createFailedTitle'),
        description: error?.message || t('deliveries.createFailedDescription'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (delivery: Delivery, next: DeliveryStatus) => {
    try {
      if (next === 'Cancelled') {
        await cancelDelivery(delivery.id);
      } else {
        await updateDeliveryStatus(delivery.id, next);
      }
      toast({
        title: t('deliveries.statusUpdatedToast'),
        description: `${delivery.deliveryNumber} → ${next}`,
      });
      await load();
      onChanged?.();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('deliveries.statusFailedTitle'),
        description: error?.message || t('deliveries.statusFailedDescription'),
      });
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('deliveries.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('deliveries.dialogDescription').replace('{orderNumber}', order.orderNumber)}
          </DialogDescription>
        </DialogHeader>

        {/* Existing deliveries */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{t('deliveries.existingHeading')}</h4>
            <Badge variant="outline">
              {t('deliveries.fulfillmentLabel')}: {order.fulfillmentStatus || 'Unfulfilled'}
            </Badge>
          </div>
          <div className="rounded-lg border max-h-56 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('deliveries.number')}</TableHead>
                  <TableHead>{t('deliveries.status')}</TableHead>
                  <TableHead>{t('deliveries.carrier')}</TableHead>
                  <TableHead>{t('deliveries.tracking')}</TableHead>
                  <TableHead>{t('deliveries.lines')}</TableHead>
                  <TableHead className="text-end">{t('deliveries.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-sm text-muted-foreground">
                      {t('common.loading')}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && deliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-sm text-muted-foreground">
                      {t('deliveries.empty')}
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="font-medium">{delivery.deliveryNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusStyles[delivery.status]}>
                          {delivery.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{delivery.carrier || '—'}</TableCell>
                      <TableCell className="text-sm">{delivery.trackingNumber || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {delivery.items
                          .map((line) => `${line.description} × ${line.quantity}`)
                          .join(', ')}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {delivery.status === 'Pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatus(delivery, 'Shipped')}
                            >
                              <Truck className="me-1 h-3 w-3" />
                              {t('deliveries.markShipped')}
                            </Button>
                          )}
                          {delivery.status === 'Shipped' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatus(delivery, 'Delivered')}
                            >
                              <PackageCheck className="me-1 h-3 w-3" />
                              {t('deliveries.markDelivered')}
                            </Button>
                          )}
                          {(delivery.status === 'Pending' || delivery.status === 'Shipped') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStatus(delivery, 'Cancelled')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* New delivery form */}
        {!allFulfilled && (
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="text-sm font-semibold">{t('deliveries.newHeading')}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('deliveries.carrier')}</Label>
                <Input
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder={t('deliveries.carrierPlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('deliveries.tracking')}</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder={t('deliveries.trackingPlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('deliveries.scheduledFor')}</Label>
                <Input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t('deliveries.notes')}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('deliveries.notesPlaceholder')}
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t('deliveries.lineItem')}</TableHead>
                    <TableHead className="text-end">{t('deliveries.ordered')}</TableHead>
                    <TableHead className="text-end">{t('deliveries.alreadyDelivered')}</TableHead>
                    <TableHead className="text-end">{t('deliveries.remaining')}</TableHead>
                    <TableHead className="text-end w-32">{t('deliveries.qtyToShip')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item, idx) => {
                    const remaining = remainingByLine[idx] || 0;
                    const delivered = order.deliveredQuantityByLine?.[idx] || 0;
                    const row = lineForms[idx] || { enabled: false, quantity: '0' };
                    const disabled = remaining <= 0;
                    return (
                      <TableRow key={idx} className={disabled ? 'opacity-50' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={disabled}
                            onChange={(e) =>
                              setLineForms((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r)),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{item.description}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        </TableCell>
                        <TableCell className="text-end">{item.quantity}</TableCell>
                        <TableCell className="text-end">{delivered}</TableCell>
                        <TableCell className="text-end font-medium">{remaining}</TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            step="0.01"
                            className="text-end"
                            value={row.quantity}
                            disabled={disabled || !row.enabled}
                            onChange={(e) =>
                              setLineForms((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)),
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          {!allFulfilled && (
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? t('deliveries.creating') : t('deliveries.recordDelivery')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
