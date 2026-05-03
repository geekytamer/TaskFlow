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
import { getClients, createInvoice, getInvoiceTemplates, getSalesOrders } from '@/services/financeService';
import { getTasksByClient, markTasksAsInvoiced } from '@/services/projectService';
import type { Client, InvoiceLineItem, InvoiceTemplate, SalesOrder } from '@/modules/finance/types';
import type { Task } from '@/modules/projects/types';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { add, format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useCompanyCurrency } from '@/lib/currency';

interface CreateInvoiceSheetProps {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInvoiceCreated: () => void;
}

export function CreateInvoiceSheet({ children, open, onOpenChange, onInvoiceCreated }: CreateInvoiceSheetProps) {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useI18n();
  const { currencyCode, amount } = useCompanyCurrency();
  const [clients, setClients] = React.useState<Client[]>([]);
  const [templates, setTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [salesOrders, setSalesOrders] = React.useState<SalesOrder[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>();
  const [selectedClient, setSelectedClient] = React.useState<string | undefined>();
  const [selectedSalesOrderId, setSelectedSalesOrderId] = React.useState<string | undefined>();
  const [billableTasks, setBillableTasks] = React.useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingTasks, setLoadingTasks] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [minAmount, setMinAmount] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'Done' | 'In Progress' | 'To Do' | 'all'>('Done');
  const [sortBy, setSortBy] = React.useState<'date' | 'amount'>('date');
  const [manualDescription, setManualDescription] = React.useState('');
  const [manualQuantity, setManualQuantity] = React.useState('1');
  const [manualUnitPrice, setManualUnitPrice] = React.useState('');
  const [manualSku, setManualSku] = React.useState('');
  const [manualLines, setManualLines] = React.useState<InvoiceLineItem[]>([]);

  React.useEffect(() => {
    async function loadClients() {
      if (!selectedCompany) {
        setClients([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [clientData, templateData] = await Promise.all([
          getClients(selectedCompany.id),
          getInvoiceTemplates(selectedCompany.id),
        ]);
        const orderData = await getSalesOrders(selectedCompany.id);
        setClients(clientData);
        setTemplates(templateData);
        setSalesOrders(orderData.filter((order) => order.status === 'Confirmed' && !order.invoiceId));
        setSelectedTemplateId((current) =>
          current || templateData.find((template) => template.isDefault)?.id || templateData[0]?.id,
        );
      } catch (error: any) {
        setClients([]);
        setTemplates([]);
        setSalesOrders([]);
        toast({
          variant: 'destructive',
          title: 'Clients unavailable',
          description: error?.message || 'Could not load clients.',
        });
      } finally {
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
            try {
              const tasks = await getTasksByClient(selectedCompany.id, selectedClient);
              const candidates = tasks.filter(t => t.invoiceAmount && !t.generatedInvoiceId);
              setBillableTasks(candidates);
              setSelectedTaskIds([]);
            } catch (error: any) {
              setBillableTasks([]);
              setSelectedTaskIds([]);
              toast({
                variant: 'destructive',
                title: 'Billable tasks unavailable',
                description: error?.message || 'Could not load billable tasks.',
              });
            } finally {
              setLoadingTasks(false);
            }
        } else {
            setBillableTasks([]);
            setLoadingTasks(false);
        }
    }
    loadTasks();
  }, [selectedClient, selectedCompany]);
  
  const handleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const taskLineItems: InvoiceLineItem[] = React.useMemo(() => {
    return selectedTaskIds.map(id => {
      const task = billableTasks.find(t => t.id === id);
      const amount = task?.invoiceAmount || 0;
      return {
        taskId: id,
        itemType: 'Task' as const,
        sku: task?.invoiceNumber || undefined,
        description: `${task?.title} (Vendor: ${task?.invoiceVendor || 'N/A'}, Inv: ${task?.invoiceNumber || 'N/A'})`,
        quantity: 1,
        unitPrice: amount,
        amount,
      };
    }).filter(item => item.amount > 0);
  }, [selectedTaskIds, billableTasks]);

  const selectedLineItems = React.useMemo(
    () => [...taskLineItems, ...manualLines],
    [taskLineItems, manualLines],
  );

  const invoiceTotal = React.useMemo(() =>
    selectedLineItems.reduce((sum, item) => sum + item.amount, 0),
  [selectedLineItems]);

  const confirmedOrdersForClient = React.useMemo(
    () => salesOrders.filter((order) => !selectedClient || order.clientId === selectedClient),
    [salesOrders, selectedClient],
  );

  const applySalesOrder = (salesOrderId: string) => {
    const order = salesOrders.find((candidate) => candidate.id === salesOrderId);
    setSelectedSalesOrderId(salesOrderId);
    if (!order) return;
    setSelectedClient(order.clientId);
    setSelectedTaskIds([]);
    setManualLines(order.items.map((item) => ({
      itemType: 'Manual' as const,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.lineTotal,
    })));
  };

  const addManualLine = () => {
    const description = manualDescription.trim();
    const quantity = Number(manualQuantity || 1);
    const unitPrice = Number(manualUnitPrice || 0);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) {
      toast({
        variant: 'destructive',
        title: 'Invalid manual line',
        description: 'Description, quantity, and unit price are required.',
      });
      return;
    }

    const amount = Number((quantity * unitPrice).toFixed(2));
    setManualLines((prev) => [
      ...prev,
      {
        itemType: 'Manual' as const,
        sku: manualSku.trim() || undefined,
        description,
        quantity,
        unitPrice,
        amount,
      },
    ]);
    setManualDescription('');
    setManualQuantity('1');
    setManualUnitPrice('');
    setManualSku('');
  };

  const removeManualLine = (index: number) => {
    setManualLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const filteredTasks = React.useMemo(() => {
    return billableTasks
      .filter((t) => statusFilter === 'all' ? true : t.status === statusFilter)
      .filter((t) => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          (t.invoiceVendor || '').toLowerCase().includes(q) ||
          (t.invoiceNumber || '').toLowerCase().includes(q)
        );
      })
      .filter((t) => {
        const min = parseFloat(minAmount);
        if (Number.isNaN(min)) return true;
        return (t.invoiceAmount || 0) >= min;
      })
      .sort((a, b) => {
        if (sortBy === 'amount') {
          return (b.invoiceAmount || 0) - (a.invoiceAmount || 0);
        }
        const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
        const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
        return dateB - dateA;
      });
  }, [billableTasks, statusFilter, search, minAmount, sortBy]);

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

      const newInvoice = await createInvoice({
        companyId: selectedCompany.id,
        clientId: selectedClient,
        salesOrderId: selectedSalesOrderId,
        templateId: selectedTemplateId,
        issueDate,
        dueDate,
        lineItems: selectedLineItems,
        total: invoiceTotal,
        currency: currencyCode,
        status: 'Draft',
      });
      
      await markTasksAsInvoiced(selectedTaskIds, newInvoice.id);

      toast({
        title: t('finance.invoiceCreated'),
        description: t('finance.invoiceCreatedDescription').replace('{invoiceNumber}', newInvoice.invoiceNumber),
      });
      onInvoiceCreated();
      onOpenChange(false);
      resetState();
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to create invoice.',
      });
    }
  };

  const resetState = () => {
    setSelectedClient(undefined);
    setSelectedSalesOrderId(undefined);
    setSelectedTemplateId(undefined);
    setBillableTasks([]);
    setSelectedTaskIds([]);
    setManualLines([]);
    setManualDescription('');
    setManualQuantity('1');
    setManualUnitPrice('');
    setManualSku('');
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
            <div className="pe-6">
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

            <div className="pe-6">
                <Label>{t('finance.salesOrder')}</Label>
                <Select
                  onValueChange={applySalesOrder}
                  value={selectedSalesOrderId}
                  disabled={loading || confirmedOrdersForClient.length === 0}
                >
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('finance.selectSalesOrder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {confirmedOrdersForClient.map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                                {order.orderNumber} - {amount(order.totalAmount)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="pe-6">
                <Label>Invoice Template</Label>
                <Select
                  onValueChange={setSelectedTemplateId}
                  value={selectedTemplateId}
                  disabled={loading || templates.length === 0}
                >
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                                {template.name}{template.isDefault ? ' (Default)' : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-3 pe-6 md:grid-cols-4">
              <div className="md:col-span-2 space-y-1">
                <Label>Search</Label>
                <Input
                  placeholder="Search title, vendor, invoice #"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Min Amount</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="To Do">To Do</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Sort By</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border p-4 pe-6 space-y-3">
              <p className="text-sm font-semibold">Add Manual Item</p>
              <div className="grid gap-3 md:grid-cols-5">
                <div className="md:col-span-2 space-y-1">
                  <Label>Description</Label>
                  <Input
                    placeholder="Service or product description"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>SKU / Ref</Label>
                  <Input
                    placeholder="Optional"
                    value={manualSku}
                    onChange={(e) => setManualSku(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    value={manualQuantity}
                    onChange={(e) => setManualQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unit Price</Label>
                  <Input
                    type="number"
                    value={manualUnitPrice}
                    onChange={(e) => setManualUnitPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={addManualLine}>
                  Add Manual Line
                </Button>
              </div>
            </div>
            
            <div className="flex-1 rounded-lg border overflow-y-auto pe-1">
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
                            <TableHead className="text-end">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingTasks ? (
                             <TableRow><TableCell colSpan={4} className="text-center">Loading tasks...</TableCell></TableRow>
                        ) : filteredTasks.length > 0 ? (
                            filteredTasks.map(task => (
                                <TableRow key={task.id} onClick={() => handleSelectTask(task.id)} className="cursor-pointer">
                                    <TableCell><Checkbox checked={selectedTaskIds.includes(task.id)} /></TableCell>
                                    <TableCell>
                                        <p className="font-medium">{task.title}</p>
                                        <p className="text-sm text-muted-foreground">{task.invoiceVendor} - #{task.invoiceNumber}</p>
                                    </TableCell>
                                    <TableCell>{task.invoiceDate ? format(task.invoiceDate, 'MMM d, yyyy') : 'N/A'}</TableCell>
                                    <TableCell className="text-end">{amount(task.invoiceAmount || 0)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow><TableCell colSpan={4} className="text-center h-24">{selectedClient ? 'No billable tasks found for this client.' : 'Please select a client.'}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="pe-6">
                {manualLines.length > 0 && (
                  <div className="mb-4 rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Manual Item</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-end">Qty</TableHead>
                          <TableHead className="text-end">Unit Price</TableHead>
                          <TableHead className="text-end">Amount</TableHead>
                          <TableHead className="text-end">Remove</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualLines.map((line, index) => (
                          <TableRow key={`${line.description}-${index}`}>
                            <TableCell>{line.description}</TableCell>
                            <TableCell>{line.sku || '—'}</TableCell>
                            <TableCell className="text-end">{line.quantity}</TableCell>
                            <TableCell className="text-end">{amount(line.unitPrice)}</TableCell>
                            <TableCell className="text-end">{amount(line.amount)}</TableCell>
                            <TableCell className="text-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeManualLine(index)}
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="flex justify-end items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <p className="font-semibold">Invoice Total:</p>
                    <p className="text-2xl font-bold">{amount(invoiceTotal)}</p>
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
