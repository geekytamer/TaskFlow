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
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getClients, getInvoices } from '@/services/financeService';
import type { Client, Invoice } from '../types';
import { AddClientDialog } from './add-client-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';

export function ClientTable() {
  const { selectedCompany } = useCompany();
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [clientInvoices, setClientInvoices] = React.useState<Invoice[]>([]);

  const fetchData = React.useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [clientData, invoiceData] = await Promise.all([
        getClients(selectedCompany.id),
        getInvoices(selectedCompany.id),
      ]);
      setClients(clientData);
      if (selectedClient) {
        setClientInvoices(invoiceData.filter((inv) => inv.clientId === selectedClient.id));
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not load clients.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast, selectedClient]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-48" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <AddClientDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onClientAdded={fetchData}
        >
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </AddClientDialog>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow
                key={client.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => {
                  setSelectedClient(client);
                  getInvoices(selectedCompany!.id)
                    .then((invs) => setClientInvoices(invs.filter((i) => i.clientId === client.id)))
                    .catch(() => setClientInvoices([]));
                }}
              >
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell>{client.email}</TableCell>
                <TableCell>{client.address}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <SheetContent className="w-full max-w-2xl sm:max-w-2xl">
          {selectedClient && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedClient.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{selectedClient.email}</p>
              </SheetHeader>
              <div className="space-y-6 py-4">
                {(() => {
                  const total = clientInvoices.reduce((sum, inv) => sum + inv.total, 0);
                  const paid = clientInvoices
                    .filter((inv) => inv.status === 'Paid')
                    .reduce((sum, inv) => sum + inv.total, 0);
                  const outstanding = clientInvoices
                    .filter((inv) => inv.status === 'Sent' || inv.status === 'Overdue')
                    .reduce((sum, inv) => sum + inv.total, 0);
                  const paidPct = total ? Math.round((paid / total) * 100) : 0;
                  return (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Total Billed</p>
                        <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Outstanding</p>
                        <p className="text-2xl font-bold text-orange-600">${outstanding.toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Paid</p>
                        <p className="text-2xl font-bold text-green-600">${paid.toFixed(2)}</p>
                        <Progress value={paidPct} className="mt-2" />
                        <p className="text-xs text-muted-foreground mt-1">{paidPct}% paid</p>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <p className="text-sm font-semibold mb-2">Invoice History</p>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Issued</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                            <TableCell>{format(inv.issueDate, 'MMM d, yyyy')}</TableCell>
                            <TableCell>{format(inv.dueDate, 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{inv.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">${inv.total.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {clientInvoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              No invoices yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
