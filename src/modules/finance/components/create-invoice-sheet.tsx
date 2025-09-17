'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { getClients, createInvoice } from '@/services/financeService';
import { getTasksByClient, markTasksAsInvoiced } from '@/services/projectService';
import type { Client, InvoiceLineItem } from '@/modules/finance/types';
import type { Task } from '@/modules/projects/types';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { add, format } from 'date-fns';

interface CreateInvoiceSheetProps {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInvoiceCreated: () => void;
}

export function CreateInvoiceSheet({ children, open, onOpenChange, onInvoiceCreated }: CreateInvoiceSheetProps) {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [clients, setClients] = React.useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = React.useState<string | undefined>();
  const [billableTasks, setBillableTasks] = React.useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingTasks, setLoadingTasks] = React.useState(false);

  React.useEffect(() => {
    async function loadClients() {
      if (selectedCompany) {
        setLoading(true);
        const clientData = await getClients(selectedCompany.id);
        setClients(clientData);
        setLoading(false);
      }
    }
    if (open) {
      loadClients();
    }
  }, [open, selectedCompany]);
  
  React.useEffect(() => {
    async function loadTasks() {
        if (selectedClient && selectedCompany) {
            setLoadingTasks(true);
            const tasks = await getTasksByClient(selectedCompany.id, selectedClient);
            const unbilledTasks = tasks.filter(t => t.invoiceAmount && t.status === 'Done' && !t.generatedInvoiceId);
            setBillableTasks(unbilledTasks);
            setSelectedTaskIds([]);
            setLoadingTasks(false);
        } else {
            setBillableTasks([]);
        }
    }
    loadTasks();
  }, [selectedClient, selectedCompany]);
  
  const handleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const selectedLineItems: InvoiceLineItem[] = React.useMemo(() => {
    return selectedTaskIds.map(id => {
      const task = billableTasks.find(t => t.id === id);
      return {
        taskId: id,
        description: `${task?.title} (Vendor: ${task?.invoiceVendor || 'N/A'}, Inv: ${task?.invoiceNumber || 'N/A'})`,
        amount: task?.invoiceAmount || 0,
      };
    }).filter(item => item.amount > 0);
  }, [selectedTaskIds, billableTasks]);

  const invoiceTotal = React.useMemo(() =>
    selectedLineItems.reduce((sum, item) => sum + item.amount, 0),
  [selectedLineItems]);

  const handleCreateInvoice = async () => {
    if (!selectedCompany || !selectedClient || selectedLineItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please select a client and at least one billable item.',
      });
      return;
    }

    try {
      const issueDate = new Date();
      const dueDate = add(issueDate, { days: 30 });
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

      const newInvoice = await createInvoice({
        invoiceNumber,
        companyId: selectedCompany.id,
        clientId: selectedClient,
        issueDate,
        dueDate,
        lineItems: selectedLineItems,
        total: invoiceTotal,
        status: 'Draft',
      });
      
      await markTasksAsInvoiced(selectedTaskIds, newInvoice.id);

      toast({
        title: 'Invoice Created',
        description: `Invoice ${invoiceNumber} has been created in draft status.`,
      });
      onInvoiceCreated();
      onOpenChange(false);
      resetState();
    } catch (error) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create invoice.',
      });
    }
  };

  const resetState = () => {
    setSelectedClient(undefined);
    setBillableTasks([]);
    setSelectedTaskIds([]);
  }
  
  const handleOpenChange = (isOpen: boolean) => {
      if(!isOpen) {
          resetState();
      }
      onOpenChange(isOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full max-w-3xl sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Create New Invoice</SheetTitle>
          <SheetDescription>Select a client to find billable tasks and generate an invoice.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 flex flex-col gap-4 py-4 overflow-y-auto">
            <div className="pr-6">
                <Select onValueChange={setSelectedClient} value={selectedClient} disabled={loading}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a client..." />
                    </SelectTrigger>
                    <SelectContent>
                        {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                                {client.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            <div className="flex-1 rounded-lg border overflow-y-auto pr-1">
                 <Table>
                    <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                            <TableHead className="w-[50px]"><Checkbox
                                checked={selectedTaskIds.length > 0 && selectedTaskIds.length === billableTasks.length}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setSelectedTaskIds(billableTasks.map(t => t.id));
                                    } else {
                                        setSelectedTaskIds([]);
                                    }
                                }}
                            /></TableHead>
                            <TableHead>Task / Vendor Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingTasks ? (
                             <TableRow><TableCell colSpan={4} className="text-center">Loading tasks...</TableCell></TableRow>
                        ) : billableTasks.length > 0 ? (
                            billableTasks.map(task => (
                                <TableRow key={task.id} onClick={() => handleSelectTask(task.id)} className="cursor-pointer">
                                    <TableCell><Checkbox checked={selectedTaskIds.includes(task.id)} /></TableCell>
                                    <TableCell>
                                        <p className="font-medium">{task.title}</p>
                                        <p className="text-sm text-muted-foreground">{task.invoiceVendor} - #{task.invoiceNumber}</p>
                                    </TableCell>
                                    <TableCell>{task.invoiceDate ? format(task.invoiceDate, 'MMM d, yyyy') : 'N/A'}</TableCell>
                                    <TableCell className="text-right">${task.invoiceAmount?.toFixed(2)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow><TableCell colSpan={4} className="text-center h-24">{selectedClient ? 'No billable tasks found for this client.' : 'Please select a client.'}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="pr-6">
                <div className="flex justify-end items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <p className="font-semibold">Invoice Total:</p>
                    <p className="text-2xl font-bold">${invoiceTotal.toFixed(2)}</p>
                </div>
            </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreateInvoice} disabled={selectedLineItems.length === 0}>
            Create Draft Invoice
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
