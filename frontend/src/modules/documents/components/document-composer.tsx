'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { createDocument } from '@/services/documentService';
import { getClients, getInvoices } from '@/services/financeService';
import { getContacts } from '@/services/contactService';
import type { DocumentTemplate, DocumentInstance } from '@/modules/documents/types';
import { DocumentRenderer } from '@/modules/documents/document-renderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Printer, Save } from 'lucide-react';

type RecordOption = { id: string; label: string; ctx: Record<string, string> };

export function DocumentComposer({
  template, existing, onBack, onSaved,
}: {
  template: DocumentTemplate;
  existing?: DocumentInstance | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const [title, setTitle] = React.useState(existing?.title ?? template.name);
  const [recordId, setRecordId] = React.useState(existing?.recordId ?? '');
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>(existing?.fieldValues ?? {});
  const [options, setOptions] = React.useState<RecordOption[]>([]);
  const [saving, setSaving] = React.useState(false);
  const printRef = React.useRef<HTMLDivElement>(null);

  const source = template.dataSource;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCompany || source === 'none') { setOptions([]); return; }
      try {
        let opts: RecordOption[] = [];
        if (source === 'client') {
          const clients = await getClients(selectedCompany.id);
          opts = clients.map((c: any) => ({
            id: c.id, label: c.name,
            ctx: { 'client.name': c.name || '', 'client.email': c.email || '', 'client.phone': c.phone || '', 'client.address': c.address || '', 'client.vatNumber': c.vatNumber || '' },
          }));
        } else if (source === 'invoice') {
          const invoices = await getInvoices(selectedCompany.id);
          opts = invoices.map((i: any) => ({
            id: i.id, label: i.invoiceNumber,
            ctx: {
              'invoice.number': i.invoiceNumber || '', 'invoice.total': String(i.total ?? ''),
              'invoice.outstanding': String(i.outstandingAmount ?? i.total ?? ''),
              'invoice.issueDate': i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '',
              'invoice.dueDate': i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '',
              'invoice.status': i.status || '',
            },
          }));
        } else if (source === 'contact') {
          const contacts = await getContacts(selectedCompany.id);
          opts = contacts.map((c: any) => ({
            id: c.id, label: c.name,
            ctx: { 'contact.name': c.name || '', 'contact.email': c.email || '', 'contact.phone': c.phone || '', 'contact.company': c.company || '', 'contact.role': c.role || '' },
          }));
        }
        if (!cancelled) setOptions(opts);
      } catch { if (!cancelled) setOptions([]); }
    })();
    return () => { cancelled = true; };
  }, [selectedCompany, source]);

  const ctx = React.useMemo(() => {
    const base: Record<string, string> = {
      'company.name': selectedCompany?.name || '',
      today: new Date().toLocaleDateString(),
    };
    const rec = options.find((o) => o.id === recordId);
    Object.assign(base, rec?.ctx || {});
    Object.assign(base, fieldValues);
    return base;
  }, [options, recordId, fieldValues, selectedCompany]);

  const save = async (status: 'draft' | 'final') => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      await createDocument(selectedCompany.id, {
        templateId: template.id, title: title.trim() || template.name,
        recordType: source, recordId: recordId || undefined, fieldValues,
      });
      toast({ title: status === 'final' ? tr('Document finalized', 'تم اعتماد المستند') : tr('Document saved', 'تم حفظ المستند') });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    } finally { setSaving(false); }
  };

  const print = () => {
    const node = printRef.current;
    if (!node) return;
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(`<html><head><title>${title}</title><style>@page{size:A4;margin:0}body{margin:0}</style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-2 h-4 w-4" />{tr('Back', 'رجوع')}</Button>
          <h3 className="text-lg font-semibold">{tr('New document', 'مستند جديد')} — {template.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={print}><Printer className="me-2 h-4 w-4" />{tr('Print', 'طباعة')}</Button>
          <Button onClick={() => save('final')} disabled={saving}><Save className="me-2 h-4 w-4" />{tr('Save', 'حفظ')}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Left: inputs */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">{tr('Document title', 'عنوان المستند')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          {source !== 'none' && (
            <div className="grid gap-1.5">
              <Label className="text-xs">{tr('Linked record', 'السجل المرتبط')} ({source})</Label>
              <Select value={recordId} onValueChange={setRecordId}>
                <SelectTrigger><SelectValue placeholder={tr('Select a record', 'اختر سجلاً')} /></SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              {options.length === 0 && <p className="text-xs text-muted-foreground">{tr('No records available for this source.', 'لا توجد سجلات لهذا المصدر.')}</p>}
            </div>
          )}
          {template.manualFields.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold">{tr('Fields', 'الحقول')}</Label>
              {template.manualFields.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
                  <Input value={fieldValues[f.key] ?? ''} onChange={(e) => setFieldValues((p) => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: preview (printed area) */}
        <div className="self-start overflow-auto">
          <div ref={printRef}>
            <DocumentRenderer doc={template.doc} letterhead={template.letterhead} ctx={ctx} scale={0.72} />
          </div>
        </div>
      </div>
    </div>
  );
}
