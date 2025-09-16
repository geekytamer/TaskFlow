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
import { PlusCircle } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getInvoices } from '@/services/financeService';
import type { Client, Invoice, InvoiceStatus } from '../types';
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
  const [loading, setLoading] = React.useState(true);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [invoiceData, clientData] = await Promise.all([
        getInvoices(selectedCompany.id),
        getClients(selectedCompany.id)
      ]);
      setInvoices(invoiceData);
      setClients(clientData);
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
                  <Badge variant="outline" className={statusColors[invoice.status]}>{invoice.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
