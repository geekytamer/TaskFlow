'use client';

import * as React from 'react';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { DocRenderer } from '@/modules/finance/doc/doc-renderer';
import { templateToDoc } from '@/modules/finance/doc/template-to-doc';
import type { Client, Invoice, InvoiceTemplate } from '@/modules/finance/types';
import { createDocument } from '@/services/documentService';
import { getClients } from '@/services/financeService';

export function DocumentComposer({
  template,
  onBack,
  onSaved,
}: {
  template: InvoiceTemplate;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [title, setTitle] = React.useState(template.name);
  const [clientId, setClientId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [clients, setClients] = React.useState<Client[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!selectedCompany) {
      setClients([]);
      return;
    }
    getClients(selectedCompany.id)
      .then((items) => {
        if (!cancelled) setClients(items);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const selectedClient = React.useMemo(
    () => clients.find((client) => client.id === clientId),
    [clientId, clients],
  );
  const previewInvoice = React.useMemo<Invoice>(() => {
    const now = new Date();
    return {
      id: 'document-preview',
      invoiceNumber: title.trim() || template.name,
      companyId: selectedCompany?.id ?? template.companyId,
      clientId,
      issueDate: now,
      dueDate: now,
      lineItems: [],
      total: 0,
      status: 'Draft',
      notes,
      currency: '',
      taxRate: 0,
    };
  }, [clientId, notes, selectedCompany?.id, template.companyId, template.name, title]);
  const doc = React.useMemo(
    () => template.doc || templateToDoc(template),
    [template],
  );

  const save = async (status: 'draft' | 'final') => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      await createDocument(selectedCompany.id, {
        templateId: template.id,
        title: title.trim() || template.name,
        recordType: clientId ? 'client' : undefined,
        recordId: clientId || undefined,
        fieldValues: { 'document.notes': notes },
        status,
      });
      toast({
        title: status === 'final'
          ? tr('Document finalized', 'تم اعتماد المستند')
          : tr('Draft saved', 'تم حفظ المسودة'),
      });
      onSaved();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not create document', 'تعذر إنشاء المستند'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {tr('Back', 'رجوع')}
          </Button>
          <div>
            <h3 className="text-lg font-semibold">{tr('New document', 'مستند جديد')} — {template.name}</h3>
            <p className="text-xs text-muted-foreground">
              {tr('The selected template is frozen when this document is saved.', 'يتم تثبيت القالب المحدد عند حفظ المستند.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => save('draft')} disabled={saving}>
            <Save className="me-2 h-4 w-4" />
            {tr('Save draft', 'حفظ كمسودة')}
          </Button>
          <Button onClick={() => save('final')} disabled={saving}>
            <CheckCircle2 className="me-2 h-4 w-4" />
            {tr('Finalize', 'اعتماد')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label>{tr('Document title', 'عنوان المستند')}</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Linked client', 'العميل المرتبط')}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder={tr('Select a client', 'اختر عميلاً')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Document notes', 'ملاحظات المستند')}</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={tr('Add document-specific wording or notes.', 'أضف نصاً أو ملاحظات خاصة بالمستند.')}
              rows={7}
            />
          </div>
        </div>

        <div className="min-w-0 overflow-auto rounded-lg border bg-muted/30 p-4">
          <div className="mx-auto w-fit">
            <DocRenderer
              doc={doc}
              invoice={previewInvoice}
              client={selectedClient}
              company={selectedCompany}
              template={template}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
