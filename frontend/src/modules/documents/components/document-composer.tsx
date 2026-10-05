'use client';

import * as React from 'react';
import { ArrowLeft, Braces, CheckCircle2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { GENERIC_TOKEN_GROUPS, fieldLabel, templateFields } from '@/modules/finance/doc/tokens';
import { publicDocumentUrl } from '@/services/publicService';
import { templateToDoc } from '@/modules/finance/doc/template-to-doc';
import type { Client, Invoice, InvoiceTemplate } from '@/modules/finance/types';
import type { DocumentInstance } from '@/modules/documents/types';
import { createDocument, updateDocument } from '@/services/documentService';
import { getClients } from '@/services/financeService';

const NOTES_KEY = 'document.notes';
const NO_CLIENT = 'none';

/**
 * Write a document from a template. Every {{field.*}} variable in the template
 * gets a box to fill in, the notes may use any variable, and a draft can be
 * reopened and changed until it is finalized.
 */
export function DocumentComposer({
  template,
  document,
  onBack,
  onSaved,
}: {
  template: InvoiceTemplate;
  /** An existing draft to edit; omitted for a new document. */
  document?: DocumentInstance;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [title, setTitle] = React.useState(document?.title ?? template.name);
  const [clientId, setClientId] = React.useState(document?.recordType === 'client' ? document.recordId ?? '' : '');
  const [values, setValues] = React.useState<Record<string, string>>(() => (
    document
      ? { ...document.fieldValues }
      // A new letter starts with its greeting, so the client's name is filled in.
      : template.docType === 'letter' ? { [NOTES_KEY]: 'Dear {{client.name}},\n\n' } : {}
  ));
  const [clients, setClients] = React.useState<Client[]>([]);
  const [saving, setSaving] = React.useState(false);
  const notesRef = React.useRef<HTMLTextAreaElement>(null);
  const notes = values[NOTES_KEY] ?? '';

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

  const doc = React.useMemo(() => template.doc || templateToDoc(template), [template]);
  // Fields the template asks for, plus any the notes or an earlier save use.
  const fields = React.useMemo(() => {
    const asked = templateFields(doc);
    const extra = [...templateFields(notes), ...Object.keys(values).filter((key) => key.startsWith('field.'))];
    return [...new Set([...asked, ...extra])];
  }, [doc, notes, values]);

  const selectedClient = React.useMemo(
    () => clients.find((client) => client.id === clientId),
    [clientId, clients],
  );
  const previewInvoice = React.useMemo<Invoice>(() => {
    const now = document ? new Date(document.createdAt) : new Date();
    return {
      id: document?.id ?? 'document-preview',
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
  }, [clientId, document, notes, selectedCompany?.id, template.companyId, template.name, title]);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const insertVariable = (token: string) => {
    const el = notesRef.current;
    const text = `{{${token}}}`;
    const start = el?.selectionStart ?? notes.length;
    const end = el?.selectionEnd ?? notes.length;
    setValue(NOTES_KEY, notes.slice(0, start) + text + notes.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const save = async (status: 'draft' | 'final') => {
    if (!selectedCompany) return;
    const missing = fields.filter((key) => !(values[key] ?? '').trim());
    if (status === 'final' && missing.length) {
      toast({
        variant: 'destructive',
        title: tr('Fill in every field before finalizing', 'املأ كل الحقول قبل الاعتماد'),
        description: missing.map(fieldLabel).join(', '),
      });
      return;
    }
    // Only keep values that are still in use, so a renamed field leaves no ghost.
    const fieldValues = Object.fromEntries(
      Object.entries(values).filter(([key]) => key === NOTES_KEY || fields.includes(key)),
    );
    setSaving(true);
    try {
      if (document) {
        await updateDocument(document.id, {
          title: title.trim() || template.name,
          recordType: clientId ? 'client' : undefined,
          recordId: clientId,
          fieldValues,
          status,
        });
      } else {
        await createDocument(selectedCompany.id, {
          templateId: template.id,
          title: title.trim() || template.name,
          recordType: clientId ? 'client' : undefined,
          recordId: clientId || undefined,
          fieldValues,
          status,
        });
      }
      toast({
        title: status === 'final'
          ? tr('Document finalized', 'تم اعتماد المستند')
          : tr('Draft saved', 'تم حفظ المسودة'),
      });
      onSaved();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not save the document', 'تعذر حفظ المستند'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const variableGroups = React.useMemo(() => {
    const groups = GENERIC_TOKEN_GROUPS.map((group) => ({ ...group, tokens: [...group.tokens] }));
    const own = fields.map((token) => ({ token, label: fieldLabel(token) }));
    if (own.length) groups.unshift({ group: tr('This document', 'هذا المستند'), tokens: own });
    return groups;
  }, [fields, language]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tr('Back', 'رجوع')}
          </Button>
          <div>
            <h3 className="text-lg font-semibold">
              {document ? tr('Edit draft', 'تعديل المسودة') : tr('New document', 'مستند جديد')} — <bdi>{template.name}</bdi>
            </h3>
            <p className="text-xs text-muted-foreground">
              {tr('The template is frozen when the document is first saved. A finalized document can no longer change.', 'يُثبَّت القالب عند أول حفظ للمستند. لا يمكن تغيير المستند بعد اعتماده.')}
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

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">{tr('Document title', 'عنوان المستند')}</Label>
            <Input id="doc-title" dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{tr('Linked client', 'العميل المرتبط')}</Label>
            <Select value={clientId || NO_CLIENT} onValueChange={(value) => setClientId(value === NO_CLIENT ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder={tr('Select a client', 'اختر عميلاً')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>{tr('No client', 'بدون عميل')}</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fields.length > 0 && (
            <fieldset className="space-y-3 rounded-md border bg-muted/20 p-3">
              <legend className="px-1 text-sm font-semibold">{tr('Fill in', 'املأ الحقول')}</legend>
              {fields.map((key) => {
                const long = key === 'field.body' || (values[key] ?? '').length > 60;
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`doc-${key}`}>{fieldLabel(key)}</Label>
                    {long ? (
                      <Textarea id={`doc-${key}`} dir="auto" rows={4} value={values[key] ?? ''} onChange={(event) => setValue(key, event.target.value)} />
                    ) : (
                      <Input id={`doc-${key}`} dir="auto" value={values[key] ?? ''} onChange={(event) => setValue(key, event.target.value)} />
                    )}
                  </div>
                );
              })}
            </fieldset>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="doc-notes">{tr('Document notes', 'ملاحظات المستند')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8">
                    <Braces className="me-1 h-4 w-4" />{tr('Insert variable', 'إدراج متغير')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  {variableGroups.map((group, index) => (
                    <React.Fragment key={group.group}>
                      {index > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel>{group.group}</DropdownMenuLabel>
                      {group.tokens.filter((item) => item.token !== NOTES_KEY).map((item) => (
                        <DropdownMenuItem key={item.token} onSelect={() => insertVariable(item.token)}>
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Textarea
              id="doc-notes"
              ref={notesRef}
              dir="auto"
              value={notes}
              onChange={(event) => setValue(NOTES_KEY, event.target.value)}
              placeholder={tr('Wording for this document. Variables like {{client.name}} are filled in.', 'نص هذا المستند. تُملأ المتغيرات مثل {{client.name}} تلقائيًا.')}
              rows={7}
            />
            <p className="text-xs text-muted-foreground">
              {tr('Type {{field.anything}} to add your own field to fill in.', 'اكتب {{field.anything}} لإضافة حقل خاص بك.')}
            </p>
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
              publicUrl={publicDocumentUrl(previewInvoice.id)}
              fields={values}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
