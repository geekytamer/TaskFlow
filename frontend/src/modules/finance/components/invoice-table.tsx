'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlusCircle, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { createPayment, getInvoices, updateInvoiceStatus } from '@/services/financeService';
import type { Client, Invoice, InvoiceStatus } from '../types';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTasks } from '@/services/projectService';
import type { Task } from '@/modules/projects/types';
import { format } from 'date-fns';
import { getClients } from '@/services/financeService';
import { CreateInvoiceSheet } from './create-invoice-sheet';

const statusColors: Record<InvoiceStatus, string> = {
    Draft: 'bg-gray-200 text-gray-800',
    Sent: 'bg-blue-200 text-blue-800',
    Paid: 'bg-green-200 text-green-800',
    Overdue: 'bg-red-200 text-red-800',
}

export function InvoiceTable() {
  const { selectedCompany } = useCompany();
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [paymentDialog, setPaymentDialog] = React.useState<{ open: boolean; invoice?: Invoice }>({ open: false });
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [paymentNote, setPaymentNote] = React.useState('');
  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [invoiceData, clientData, taskData] = await Promise.all([
        getInvoices(selectedCompany.id),
        getClients(selectedCompany.id),
        getTasks(),
      ]);
      setInvoices(invoiceData);
      setClients(clientData);
      setTasks(taskData.filter((t) => t.companyId === selectedCompany.id));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not load invoices.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'N/A';
  }

  const handleStatusChange = async (invoiceId: string, status: InvoiceStatus) => {
    try {
      await updateInvoiceStatus(invoiceId, status);
      await fetchData();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: 'Could not update invoice status.',
      });
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const getTaskTitle = (taskId: string) =>
    tasks.find((t) => t.id === taskId)?.title || taskId;

  return (
    <>
      <div className="flex justify-end mb-4">
        <CreateInvoiceSheet 
            open={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            onInvoiceCreated={fetchData}
        >
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Invoice
            </Button>
        </CreateInvoiceSheet>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origin Tasks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                <TableCell>{getClientName(invoice.clientId)}</TableCell>
                <TableCell>{format(invoice.issueDate, 'MMM d, yyyy')}</TableCell>
                <TableCell>{format(invoice.dueDate, 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right">${invoice.total.toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Select
                      value={invoice.status}
                      onValueChange={(value) => handleStatusChange(invoice.id, value as InvoiceStatus)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['Draft', 'Sent', 'Paid', 'Overdue'] as InvoiceStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {invoice.status !== 'Paid' && invoice.dueDate < new Date() && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {invoice.lineItems.map((item) => (
                      <Badge key={item.taskId} variant="outline">
                        {getTaskTitle(item.taskId)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Dialog
                    open={paymentDialog.open && paymentDialog.invoice?.id === invoice.id}
                    onOpenChange={(open) => {
                      if (!open) setPaymentDialog({ open: false });
                      else setPaymentDialog({ open: true, invoice });
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">Record Payment</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                          Invoice {invoice.invoiceNumber} — {getClientName(invoice.clientId)}
                        </p>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="space-y-1">
                          <Label>Amount</Label>
                          <Input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="e.g. 500"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Method</Label>
                          <Input
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            placeholder="e.g. Bank transfer, Cash"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Note</Label>
                          <Input
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={async () => {
                            try {
                              await createPayment(invoice.id, {
                                amount: Number(paymentAmount),
                                method: paymentMethod || undefined,
                                note: paymentNote || undefined,
                              });
                              setPaymentDialog({ open: false });
                              setPaymentAmount('');
                              setPaymentMethod('');
                              setPaymentNote('');
                              await fetchData();
                              toast({ title: 'Payment recorded' });
                            } catch {
                              toast({ variant: 'destructive', title: 'Failed', description: 'Could not record payment.' });
                            }
                          }}
                          disabled={!paymentAmount}
                        >
                          Save Payment
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
