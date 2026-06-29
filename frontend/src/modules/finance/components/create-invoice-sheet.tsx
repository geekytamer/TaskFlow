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
import { Combobox } from '@/components/ui/combobox';
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
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
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
  const [manualDiscount, setManualDiscount] = React.useState('0');
  const [manualDiscountType, setManualDiscountType] = React.useState<'percent' | 'amount'>('percent');
  const [manualCustom, setManualCustom] = React.useState<Record<string, string>>({});
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
          title: tr('Clients unavailable', 'العملاء غير متاحين'),
          description: error?.message || tr('Could not load clients.', 'تعذر تحميل العملاء.'),
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
                title: tr('Billable tasks unavailable', 'المهام القابلة للفوترة غير متاحة'),
                description: error?.message || tr('Could not load billable tasks.', 'تعذر تحميل المهام القابلة للفوترة.'),
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

  // Custom columns defined on the chosen template; their per-line values are
  // entered alongside each manual line item.
  const customColumns = React.useMemo(() => {
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    return (tmpl?.columns ?? []).filter((c) => c.key === 'custom' && c.visible);
  }, [templates, selectedTemplateId]);

  const updateManualLineCustom = (index: number, colId: string, value: string) => {
    setManualLines((prev) => prev.map((line, i) =>
      i === index ? { ...line, custom: { ...(line.custom || {}), [colId]: value } } : line));
  };

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
        title: tr('Invalid manual line', 'بند يدوي غير صالح'),
        description: tr('Description, quantity, and unit price are required.', 'الوصف والكمية وسعر الوحدة مطلوبة.'),
      });
      return;
    }

    const discount = Number(manualDiscount || 0);
    const gross = quantity * unitPrice;
    const off = discount > 0
      ? (manualDiscountType === 'percent' ? gross * (Math.min(discount, 100) / 100) : Math.min(discount, gross))
      : 0;
    const amount = Number(Math.max(0, gross - off).toFixed(2));
    const custom: Record<string, string> = {};
    customColumns.forEach((col) => {
      const v = manualCustom[col.id]?.trim();
      if (v) custom[col.id] = v;
    });
    setManualLines((prev) => [
      ...prev,
      {
        itemType: 'Manual' as const,
        sku: manualSku.trim() || undefined,
        description,
        quantity,
        unitPrice,
        discount: discount > 0 ? discount : undefined,
        discountType: discount > 0 ? manualDiscountType : undefined,
        amount,
        custom: Object.keys(custom).length ? custom : undefined,
      },
    ]);
    setManualDescription('');
    setManualQuantity('1');
    setManualUnitPrice('');
    setManualSku('');
    setManualDiscount('0');
    setManualDiscountType('percent');
    setManualCustom({});
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
        title: tr('Validation Error', 'خطأ في التحقق'),
        description: tr('Please select a client and at least one billable item.', 'يرجى اختيار عميل وبند واحد قابل للفوترة على الأقل.'),
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
        title: tr('Error', 'خطأ'),
        description: error?.message || tr('Failed to create invoice.', 'تعذر إنشاء الفاتورة.'),
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
    setManualDiscount('0');
    setManualDiscountType('percent');
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
          <SheetTitle>{tr('Create New Invoice', 'إنشاء فاتورة جديدة')}</SheetTitle>
          <SheetDescription>{tr('Select a client to find billable tasks and generate an invoice.', 'اختر عميلاً للعثور على المهام القابلة للفوترة وإنشاء فاتورة.')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 flex flex-col gap-4 py-4 overflow-y-auto">
            <div className="pe-6" data-tutorial="invoice-form-client">
                <Combobox
                    options={clients.map((client) => ({ value: client.id, label: client.name }))}
                    value={selectedClient}
                    onValueChange={setSelectedClient}
                    disabled={loading}
                    placeholder={t('finance.selectClient')}
                    searchPlaceholder={t('finance.selectClient')}
                />
            </div>

            <div className="pe-6" data-tutorial="invoice-form-sales-order">
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

            <div className="pe-6" data-tutorial="invoice-form-template">
                <Label>{tr('Invoice Template', 'قالب الفاتورة')}</Label>
                <Select
                  onValueChange={setSelectedTemplateId}
                  value={selectedTemplateId}
                  disabled={loading || templates.length === 0}
                >
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder={tr('Select a template...', 'اختر قالباً...')} />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                                {template.name}{template.isDefault ? tr(' (Default)', ' (افتراضي)') : ''}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-3 pe-6 md:grid-cols-4" data-tutorial="invoice-form-task-filter">
              <div className="md:col-span-2 space-y-1">
                <Label>{tr('Search', 'بحث')}</Label>
                <Input
                  placeholder={tr('Search title, vendor, invoice #', 'ابحث بالعنوان أو المورّد أو رقم الفاتورة')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{tr('Min Amount', 'الحد الأدنى للمبلغ')}</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>{tr('Status', 'الحالة')}</Label>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr('All', 'الكل')}</SelectItem>
                    <SelectItem value="Done">{tr('Done', 'منجز')}</SelectItem>
                    <SelectItem value="In Progress">{tr('In Progress', 'قيد التنفيذ')}</SelectItem>
                    <SelectItem value="To Do">{tr('To Do', 'قيد الانتظار')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>{tr('Sort By', 'الترتيب حسب')}</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">{tr('Date', 'التاريخ')}</SelectItem>
                    <SelectItem value="amount">{tr('Amount', 'المبلغ')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border p-4 pe-6 space-y-3" data-tutorial="invoice-form-manual-line">
              <p className="text-sm font-semibold">{tr('Add Manual Item', 'إضافة بند يدوي')}</p>
              <div className="grid gap-3 md:grid-cols-6">
                <div className="md:col-span-2 space-y-1">
                  <Label>{tr('Description', 'الوصف')}</Label>
                  <Input
                    placeholder={tr('Service or product description', 'وصف الخدمة أو المنتج')}
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('SKU / Ref', 'رمز / مرجع')}</Label>
                  <Input
                    placeholder={tr('Optional', 'اختياري')}
                    value={manualSku}
                    onChange={(e) => setManualSku(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('Qty', 'الكمية')}</Label>
                  <Input
                    type="number"
                    value={manualQuantity}
                    onChange={(e) => setManualQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('Unit Price', 'سعر الوحدة')}</Label>
                  <Input
                    type="number"
                    value={manualUnitPrice}
                    onChange={(e) => setManualUnitPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tr('Discount', 'الخصم')}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(e.target.value)}
                    />
                    <Select value={manualDiscountType} onValueChange={(v) => setManualDiscountType(v as 'percent' | 'amount')}>
                      <SelectTrigger className="w-16 px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">{tr('Fixed', 'ثابت')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {customColumns.length > 0 && (
                <div className="grid gap-3 md:grid-cols-3">
                  {customColumns.map((col) => (
                    <div key={col.id} className="space-y-1">
                      <Label>{col.label || tr('Custom', 'مخصص')}</Label>
                      <Input
                        placeholder={col.label}
                        value={manualCustom[col.id] ?? ''}
                        onChange={(e) => setManualCustom((prev) => ({ ...prev, [col.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={addManualLine}>
                  {tr('Add Manual Line', 'إضافة بند يدوي')}
                </Button>
              </div>
            </div>
            
            <div className="flex-1 rounded-lg border overflow-y-auto pe-1" data-tutorial="invoice-form-task-table">
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
                            <TableHead>{tr('Task / Vendor Invoice', 'المهمة / فاتورة المورّد')}</TableHead>
                            <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                            <TableHead className="text-end">{tr('Amount', 'المبلغ')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingTasks ? (
                             <TableRow><TableCell colSpan={4} className="text-center">{tr('Loading tasks...', 'جارٍ تحميل المهام...')}</TableCell></TableRow>
                        ) : filteredTasks.length > 0 ? (
                            filteredTasks.map(task => (
                                <TableRow key={task.id} onClick={() => handleSelectTask(task.id)} className="cursor-pointer">
                                    <TableCell><Checkbox checked={selectedTaskIds.includes(task.id)} /></TableCell>
                                    <TableCell>
                                        <p className="font-medium">{task.title}</p>
                                        <p className="text-sm text-muted-foreground">{task.invoiceVendor} - #{task.invoiceNumber}</p>
                                    </TableCell>
                                    <TableCell>{task.invoiceDate ? format(task.invoiceDate, 'MMM d, yyyy') : tr('N/A', 'غير متاح')}</TableCell>
                                    <TableCell className="text-end">{amount(task.invoiceAmount || 0)}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                             <TableRow><TableCell colSpan={4} className="text-center h-24">{selectedClient ? tr('No billable tasks found for this client.', 'لا توجد مهام قابلة للفوترة لهذا العميل.') : tr('Please select a client.', 'يرجى اختيار عميل.')}</TableCell></TableRow>
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
                          <TableHead>{tr('Manual Item', 'بند يدوي')}</TableHead>
                          <TableHead>{tr('SKU', 'الرمز')}</TableHead>
                          {customColumns.map((col) => (
                            <TableHead key={col.id}>{col.label || tr('Custom', 'مخصص')}</TableHead>
                          ))}
                          <TableHead className="text-end">{tr('Qty', 'الكمية')}</TableHead>
                          <TableHead className="text-end">{tr('Unit Price', 'سعر الوحدة')}</TableHead>
                          <TableHead className="text-end">{tr('Amount', 'المبلغ')}</TableHead>
                          <TableHead className="text-end">{tr('Remove', 'إزالة')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualLines.map((line, index) => (
                          <TableRow key={`${line.description}-${index}`}>
                            <TableCell>{line.description}</TableCell>
                            <TableCell>{line.sku || '—'}</TableCell>
                            {customColumns.map((col) => (
                              <TableCell key={col.id}>
                                <Input
                                  className="h-8 w-32"
                                  value={line.custom?.[col.id] ?? ''}
                                  placeholder={col.label}
                                  onChange={(e) => updateManualLineCustom(index, col.id, e.target.value)}
                                />
                              </TableCell>
                            ))}
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
                                {tr('Remove', 'إزالة')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="flex justify-end items-center gap-4 p-4 bg-muted/50 rounded-lg" data-tutorial="invoice-form-total">
                    <p className="font-semibold">{tr('Invoice Total:', 'إجمالي الفاتورة:')}</p>
                    <p className="text-2xl font-bold">{amount(invoiceTotal)}</p>
                </div>
            </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={handleCreateInvoice} disabled={selectedLineItems.length === 0} data-tutorial="invoice-form-submit">
            {tr('Create Draft Invoice', 'إنشاء مسودة فاتورة')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
