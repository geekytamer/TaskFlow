'use client';

import * as React from 'react';
import { Check, Eye, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  createInvoiceTemplate,
  deleteInvoiceTemplate,
  getInvoiceTemplates,
  updateInvoiceTemplate,
} from '@/services/financeService';
import type { InvoiceTemplateInput } from '@/services/financeService';
import type { InvoiceTemplate, InvoiceTemplateLayout, InvoiceColumn, InvoiceColumnAlign, InvoiceBankAccount, InvoiceSectionKey, Invoice, Client } from '../types';
import { invoiceSections } from '../types';
import type { Company } from '@/modules/companies/types';
import { InvoiceDocument } from './invoice-document';
import { InvoiceDesigner } from './invoice-designer';
import { useCompanyCurrency } from '@/lib/currency';
import { ArrowUp, ArrowDown } from 'lucide-react';

const makeId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultColumns = (): InvoiceColumn[] => [
  { id: 'description', key: 'description', label: 'Description', visible: true, width: 55, align: 'left' },
  { id: 'quantity', key: 'quantity', label: 'Qty', visible: true, width: 15, align: 'right' },
  { id: 'unitPrice', key: 'unitPrice', label: 'Unit', visible: true, width: 15, align: 'right' },
  { id: 'amount', key: 'amount', label: 'Amount', visible: true, width: 15, align: 'right' },
];

const emptyForm: InvoiceTemplateInput = {
  name: '',
  docType: 'invoice',
  layout: 'classic',
  isDefault: false,
  primaryColor: '#111827',
  accentColor: '#2563eb',
  logoUrl: '',
  headerImageUrl: '',
  footerImageUrl: '',
  letterheadPdfUrl: '',
  letterheadImageUrl: '',
  stampUrl: '',
  signatureUrl: '',
  signatureLabel: '',
  paymentInstructions: '',
  terms: '',
  footerNote: '',
  watermarkEnabled: false,
  watermarkText: 'DRAFT',
  watermarkOpacity: 0.12,
  showCompanyAddress: true,
  showTaxId: true,
  columns: undefined,
  bankAccounts: undefined,
  qrEnabled: true,
  qrPosition: 'center',
  sectionBreaks: undefined,
};

const layoutLabels: Record<InvoiceTemplateLayout, string> = {
  classic: 'Classic',
  modern: 'Modern',
  compact: 'Compact',
  letterhead: 'Letterhead',
};

const toForm = (template: InvoiceTemplate): InvoiceTemplateInput => ({
  name: template.name,
  docType: template.docType ?? 'invoice',
  layout: template.layout,
  isDefault: template.isDefault,
  primaryColor: template.primaryColor,
  accentColor: template.accentColor,
  logoUrl: template.logoUrl || '',
  headerImageUrl: template.headerImageUrl || '',
  footerImageUrl: template.footerImageUrl || '',
  letterheadPdfUrl: template.letterheadPdfUrl || '',
  letterheadImageUrl: template.letterheadImageUrl || '',
  stampUrl: template.stampUrl || '',
  signatureUrl: template.signatureUrl || '',
  signatureLabel: template.signatureLabel || '',
  columns: template.columns,
  bankAccounts: template.bankAccounts,
  qrEnabled: template.qrEnabled !== false,
  qrPosition: template.qrPosition || 'center',
  sectionBreaks: template.sectionBreaks,
  doc: template.doc,
  paymentInstructions: template.paymentInstructions || '',
  terms: template.terms || '',
  footerNote: template.footerNote || '',
  watermarkEnabled: template.watermarkEnabled === true,
  watermarkText: template.watermarkText || 'DRAFT',
  watermarkOpacity: template.watermarkOpacity ?? 0.12,
  showCompanyAddress: template.showCompanyAddress,
  showTaxId: template.showTaxId,
});

const cleanForm = (form: InvoiceTemplateInput): InvoiceTemplateInput => ({
  ...form,
  name: form.name.trim(),
  // Send null (not undefined) when an asset is cleared so the value is included
  // in the payload and the backend persists the removal instead of treating the
  // missing key as "no change".
  logoUrl: form.logoUrl?.trim() || null,
  headerImageUrl: form.headerImageUrl?.trim() || null,
  footerImageUrl: form.footerImageUrl?.trim() || null,
  letterheadPdfUrl: form.letterheadPdfUrl?.trim() || null,
  letterheadImageUrl: form.letterheadImageUrl?.trim() || null,
  stampUrl: form.stampUrl?.trim() || null,
  signatureUrl: form.signatureUrl?.trim() || null,
  signatureLabel: form.signatureLabel?.trim() || null,
  columns: form.columns && form.columns.length > 0 ? form.columns : undefined,
  bankAccounts: form.bankAccounts && form.bankAccounts.length > 0 ? form.bankAccounts : undefined,
  qrEnabled: form.qrEnabled !== false,
  qrPosition: form.qrPosition || 'center',
  sectionBreaks: form.sectionBreaks && form.sectionBreaks.length > 0 ? form.sectionBreaks : undefined,
  paymentInstructions: form.paymentInstructions?.trim() || undefined,
  terms: form.terms?.trim() || undefined,
  footerNote: form.footerNote?.trim() || undefined,
  watermarkEnabled: form.watermarkEnabled === true,
  watermarkText: form.watermarkText?.trim() || undefined,
  watermarkOpacity: Number.isFinite(Number(form.watermarkOpacity))
    ? Math.max(0.05, Math.min(0.4, Number(form.watermarkOpacity)))
    : 0.12,
});

const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });

interface AssetUploadFieldProps {
  label: string;
  value?: string;
  accept: string;
  onFileSelected: (file: File | null) => Promise<void> | void;
  onClear: () => void;
  hint?: string;
}

function AssetUploadField({
  label,
  value,
  accept,
  onFileSelected,
  onClear,
  hint,
}: AssetUploadFieldProps) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isImage = Boolean(value && value.startsWith('data:image'));
  const isPdf = Boolean(value && value.startsWith('data:application/pdf'));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(event) => onFileSelected(event.target.files?.[0] || null)}
        />
        {value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onClear();
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            {tr('Clear', 'مسح')}
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {isImage && (
        <img
          src={value}
          alt=""
          className="max-h-20 rounded border object-contain"
        />
      )}
      {isPdf && (
        <p className="text-xs text-muted-foreground">{tr('PDF uploaded', 'تم رفع ملف PDF')}</p>
      )}
    </div>
  );
}

const samplePreviewLines = [
  { itemType: 'Manual' as const, sku: 'SKU-001', description: 'Project implementation', quantity: 1, unitPrice: 1200, amount: 1200 },
  { itemType: 'Manual' as const, sku: 'SKU-002', description: 'Support retainer', quantity: 2, unitPrice: 250, amount: 500 },
  { itemType: 'Manual' as const, sku: 'SKU-003', description: 'On-site consultation', quantity: 3, unitPrice: 150, amount: 450 },
];

function InvoiceTemplatePreview({ template }: { template: InvoiceTemplateInput }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const now = new Date();
  const previewInvoice = {
    id: 'preview', invoiceNumber: 'INV-0042', companyId: 'preview', clientId: 'preview',
    issueDate: now, dueDate: new Date(now.getTime() + 30 * 86400000),
    lineItems: samplePreviewLines, total: 2257.5, status: 'Draft' as const, currency: 'USD', taxRate: 5,
  } as unknown as Invoice;
  const previewClient = { id: 'preview', name: 'Acme Trading LLC', address: 'Muscat Business District\nSultanate of Oman', email: 'accounts@acme.example' } as unknown as Client;
  const previewCompany = { id: 'preview', name: 'Your Company', address: 'Company address line\nCity, Country' } as unknown as Company;
  const previewTemplate = { ...template, id: 'preview', companyId: 'preview', createdAt: now, updatedAt: now } as unknown as InvoiceTemplate;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">{tr('Preview', 'معاينة')}</h3>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-muted/30 p-4">
        <div className="mx-auto w-[760px] max-w-full origin-top">
          <InvoiceDocument invoice={previewInvoice} client={previewClient} company={previewCompany} template={previewTemplate} />
        </div>
      </div>
    </div>
  );
}

export function InvoiceTemplatePanel({ docType = 'invoice' }: { docType?: 'invoice' | 'delivery' } = {}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const layoutLabel = (layout: InvoiceTemplateLayout) => {
    const map: Record<InvoiceTemplateLayout, string> = {
      classic: tr('Classic', 'كلاسيكي'),
      modern: tr('Modern', 'حديث'),
      compact: tr('Compact', 'مدمج'),
      letterhead: tr('Letterhead', 'ترويسة'),
    };
    return map[layout];
  };
  const newTemplateForm = React.useMemo(() => ({ ...emptyForm, docType }), [docType]);
  const [templates, setTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>();
  const [form, setForm] = React.useState<InvoiceTemplateInput>(newTemplateForm);
  const [loading, setLoading] = React.useState(true);
  const [designing, setDesigning] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const loadTemplates = React.useCallback(async () => {
    if (!selectedCompany) {
      setTemplates([]);
      setSelectedTemplateId(undefined);
      setForm(newTemplateForm);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getInvoiceTemplates(selectedCompany.id, docType);
      setTemplates(data);
      const nextSelected = data.find((template) => template.isDefault) || data[0];
      setSelectedTemplateId(nextSelected?.id);
      setForm(nextSelected ? toForm(nextSelected) : newTemplateForm);
    } catch (error: any) {
      setTemplates([]);
      toast({
        variant: 'destructive',
        title: tr('Templates unavailable', 'القوالب غير متاحة'),
        description: error?.message || tr('Could not load invoice templates.', 'تعذّر تحميل قوالب الفواتير.'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast, docType, newTemplateForm]);

  React.useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const updateForm = <K extends keyof InvoiceTemplateInput>(key: K, value: InvoiceTemplateInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // ─── Column manager ───────────────────────────────────────────────────────
  const columns = form.columns ?? defaultColumns();
  const setColumns = (next: InvoiceColumn[]) => updateForm('columns', next);
  const updateColumn = (id: string, patch: Partial<InvoiceColumn>) =>
    setColumns(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const moveColumn = (index: number, dir: -1 | 1) => {
    const next = [...columns];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setColumns(next);
  };
  const addCustomColumn = () =>
    setColumns([...columns, { id: makeId(), key: 'custom', label: 'New column', visible: true, width: 15, align: 'left' }]);
  const removeColumn = (id: string) => setColumns(columns.filter((c) => c.id !== id));

  // ─── Bank accounts ────────────────────────────────────────────────────────
  const bankAccounts = form.bankAccounts ?? [];
  const setBankAccounts = (next: InvoiceBankAccount[]) => updateForm('bankAccounts', next);
  const addBankAccount = () => setBankAccounts([...bankAccounts, { id: makeId() }]);
  const updateBankAccount = (id: string, patch: Partial<InvoiceBankAccount>) =>
    setBankAccounts(bankAccounts.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBankAccount = (id: string) => setBankAccounts(bankAccounts.filter((b) => b.id !== id));

  // ─── Section page placement ───────────────────────────────────────────────
  const sectionBreaks = form.sectionBreaks ?? [];
  const toggleSectionBreak = (key: InvoiceSectionKey, on: boolean) =>
    updateForm('sectionBreaks', on ? [...sectionBreaks, key] : sectionBreaks.filter((k) => k !== key));

  const selectTemplate = (template: InvoiceTemplate) => {
    setSelectedTemplateId(template.id);
    setForm(toForm(template));
  };

  const startNewTemplate = () => {
    setSelectedTemplateId(undefined);
    setForm({ ...newTemplateForm, name: `Template ${templates.length + 1}` });
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    const payload = cleanForm(form);
    if (!payload.name) {
      toast({
        variant: 'destructive',
        title: tr('Template name required', 'اسم القالب مطلوب'),
        description: tr('Enter a name before saving the template.', 'أدخل اسماً قبل حفظ القالب.'),
      });
      return;
    }
    setSaving(true);
    try {
      const saved = selectedTemplateId
        ? await updateInvoiceTemplate(selectedTemplateId, payload)
        : await createInvoiceTemplate(selectedCompany.id, payload);
      const data = await getInvoiceTemplates(selectedCompany.id, docType);
      setTemplates(data);
      setSelectedTemplateId(saved.id);
      setForm(toForm(saved));
      toast({
        title: tr('Template saved', 'تم حفظ القالب'),
        description: tr(`${saved.name} is ready for new invoices.`, `${saved.name} جاهز للفواتير الجديدة.`),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Save failed', 'فشل الحفظ'),
        description: error?.message || tr('Could not save invoice template.', 'تعذّر حفظ قالب الفاتورة.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplateId || !selectedCompany) return;
    setSaving(true);
    try {
      await deleteInvoiceTemplate(selectedTemplateId);
      await loadTemplates();
      toast({
        title: tr('Template deleted', 'تم حذف القالب'),
        description: tr('The template was removed.', 'تمت إزالة القالب.'),
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Delete failed', 'فشل الحذف'),
        description: error?.message || tr('Could not delete invoice template.', 'تعذّر حذف قالب الفاتورة.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (
    field: 'logoUrl' | 'headerImageUrl' | 'footerImageUrl' | 'letterheadPdfUrl' | 'stampUrl' | 'signatureUrl',
    file: File | null,
  ) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      toast({
        variant: 'destructive',
        title: tr('File too large', 'الملف كبير جداً'),
        description: tr('Please upload a file smaller than 8 MB.', 'يرجى رفع ملف أصغر من 8 ميجابايت.'),
      });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateForm(field, dataUrl);
      // The letterhead backs the page: images are used as-is; a PDF's first
      // page is rasterized to an image so it can render as the page background.
      if (field === 'letterheadPdfUrl') {
        if (dataUrl.startsWith('data:image/')) {
          updateForm('letterheadImageUrl', dataUrl);
        } else {
          try {
            const { rasterizePdfFirstPage } = await import('@/lib/pdf-raster');
            const image = await rasterizePdfFirstPage(dataUrl);
            updateForm('letterheadImageUrl', image);
            toast({ title: tr('Letterhead ready', 'الترويسة جاهزة'), description: tr('First page set as the page background.', 'تم تعيين الصفحة الأولى كخلفية للصفحة.') });
          } catch (rasterError: any) {
            toast({
              variant: 'destructive',
              title: tr('Could not render letterhead', 'تعذّر عرض الترويسة'),
              description: rasterError?.message || tr('The PDF could not be converted to a background image.', 'تعذّر تحويل ملف PDF إلى صورة خلفية.'),
            });
          }
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Upload failed', 'فشل الرفع'),
        description: error?.message || tr('Could not process selected file.', 'تعذّرت معالجة الملف المحدد.'),
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="rounded-lg border">
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          {tr('Select a company to manage invoice templates.', 'اختر شركة لإدارة قوالب الفواتير.')}
        </div>
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  if (designing && selectedTemplate) {
    return (
      <InvoiceDesigner
        template={selectedTemplate}
        company={selectedCompany}
        onClose={() => setDesigning(false)}
        onSaved={() => { setDesigning(false); loadTemplates(); }}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <Button type="button" className="w-full justify-start" onClick={startNewTemplate}>
          <PlusCircle className="me-2 h-4 w-4" />
          {tr('New Template', 'قالب جديد')}
        </Button>
        <div className="space-y-2">
          {loading && (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              {tr('Loading templates...', 'جارٍ تحميل القوالب...')}
            </div>
          )}
          {!loading && templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => selectTemplate(template)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                template.id === selectedTemplateId ? 'border-primary bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{template.name}</span>
                {template.isDefault && <Badge>{tr('Default', 'افتراضي')}</Badge>}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{layoutLabel(template.layout)}</span>
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: template.primaryColor }}
                />
                <span
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: template.accentColor }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{selectedTemplateId ? tr('Edit Invoice Template', 'تعديل قالب الفاتورة') : tr('New Invoice Template', 'قالب فاتورة جديد')}</CardTitle>
          <div className="flex gap-2">
            {selectedTemplateId && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setDesigning(true)}>
                {tr('Design visually', 'تصميم مرئي')}
              </Button>
            )}
            {selectedTemplateId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={saving || templates.length <= 1}
              >
                <Trash2 className="me-2 h-4 w-4" />
                {tr('Delete', 'حذف')}
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              <Check className="me-2 h-4 w-4" />
              {tr('Save', 'حفظ')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{tr('Name', 'الاسم')}</Label>
              <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Layout', 'التخطيط')}</Label>
              <Select
                value={form.layout}
                onValueChange={(value) => updateForm('layout', value as InvoiceTemplateLayout)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(layoutLabels) as InvoiceTemplateLayout[]).map((layout) => (
                    <SelectItem key={layout} value={layout}>
                      {layoutLabel(layout)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Primary Color', 'اللون الأساسي')}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) => updateForm('primaryColor', event.target.value)}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(event) => updateForm('primaryColor', event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{tr('Accent Color', 'اللون المميّز')}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.accentColor}
                  onChange={(event) => updateForm('accentColor', event.target.value)}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={form.accentColor}
                  onChange={(event) => updateForm('accentColor', event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AssetUploadField
              label={tr('Logo', 'الشعار')}
              value={form.logoUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('logoUrl', file)}
              onClear={() => updateForm('logoUrl', '')}
            />
            <AssetUploadField
              label={tr('Header Image', 'صورة الترويسة')}
              value={form.headerImageUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('headerImageUrl', file)}
              onClear={() => updateForm('headerImageUrl', '')}
            />
            <AssetUploadField
              label={tr('Footer Image', 'صورة التذييل')}
              value={form.footerImageUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('footerImageUrl', file)}
              onClear={() => updateForm('footerImageUrl', '')}
            />
            <AssetUploadField
              label={tr('Letterhead Background', 'خلفية الترويسة')}
              value={form.letterheadPdfUrl || ''}
              accept="image/*,application/pdf"
              onFileSelected={(file) => handleAssetUpload('letterheadPdfUrl', file)}
              onClear={() => { updateForm('letterheadPdfUrl', ''); updateForm('letterheadImageUrl', ''); }}
              hint={tr('PDF or image. The page is sized to a fixed sheet with this as the background.', 'ملف PDF أو صورة. يتم ضبط حجم الصفحة على ورقة ثابتة باستخدام هذا كخلفية.')}
            />
            <AssetUploadField
              label={tr('Stamp', 'الختم')}
              value={form.stampUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('stampUrl', file)}
              onClear={() => updateForm('stampUrl', '')}
              hint={tr('Shown near the signature on the invoice.', 'يظهر بجانب التوقيع على الفاتورة.')}
            />
            <AssetUploadField
              label={tr('Signature', 'التوقيع')}
              value={form.signatureUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('signatureUrl', file)}
              onClear={() => updateForm('signatureUrl', '')}
            />
          </div>

          <div className="space-y-1">
            <Label>{tr('Signature label', 'تسمية التوقيع')}</Label>
            <Input
              value={form.signatureLabel || ''}
              onChange={(event) => updateForm('signatureLabel', event.target.value)}
              placeholder={tr('Authorized signature', 'التوقيع المعتمد')}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>{tr('Payment Instructions', 'تعليمات الدفع')}</Label>
              <Textarea
                value={form.paymentInstructions || ''}
                onChange={(event) => updateForm('paymentInstructions', event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Terms', 'الشروط')}</Label>
              <Textarea
                value={form.terms || ''}
                onChange={(event) => updateForm('terms', event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Footer Note', 'ملاحظة التذييل')}</Label>
              <Textarea
                value={form.footerNote || ''}
                onChange={(event) => updateForm('footerNote', event.target.value)}
                rows={4}
              />
            </div>
          </div>

          {/* Line-item columns */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">{tr('Line-item columns', 'أعمدة البنود')}</Label>
                <p className="text-xs text-muted-foreground">{tr('Show/hide, reorder, rename and add custom columns.', 'إظهار/إخفاء وإعادة ترتيب وإعادة تسمية وإضافة أعمدة مخصصة.')}</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setColumns(defaultColumns())}>{tr('Reset', 'إعادة تعيين')}</Button>
                <Button type="button" size="sm" variant="outline" onClick={addCustomColumn}>
                  <PlusCircle className="me-1 h-3.5 w-3.5" /> {tr('Custom column', 'عمود مخصص')}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {columns.map((col, index) => (
                <div key={col.id} className="flex flex-wrap items-center gap-2 rounded border bg-muted/20 p-2">
                  <div className="flex flex-col">
                    <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0} onClick={() => moveColumn(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === columns.length - 1} onClick={() => moveColumn(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <Switch checked={col.visible} onCheckedChange={(v) => updateColumn(col.id, { visible: v })} />
                  <Input className="h-8 w-40" value={col.label} onChange={(e) => updateColumn(col.id, { label: e.target.value })} placeholder={tr('Header', 'العنوان')} />
                  <Badge variant="outline" className="text-[10px]">{col.key === 'custom' ? tr('custom', 'مخصص') : col.key}</Badge>
                  <Input className="h-8 w-20" type="number" min="5" max="80" value={col.width ?? ''} onChange={(e) => updateColumn(col.id, { width: e.target.value ? Number(e.target.value) : undefined })} placeholder={tr('width%', 'العرض٪')} />
                  <Select value={col.align ?? 'left'} onValueChange={(v) => updateColumn(col.id, { align: v as InvoiceColumnAlign })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">{tr('Left', 'يسار')}</SelectItem>
                      <SelectItem value="center">{tr('Center', 'وسط')}</SelectItem>
                      <SelectItem value="right">{tr('Right', 'يمين')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {col.key === 'custom' && (
                    <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => removeColumn(col.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Payment / bank accounts */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">{tr('Bank accounts', 'الحسابات البنكية')}</Label>
                <p className="text-xs text-muted-foreground">{tr('Shown in the payment section of the invoice.', 'تظهر في قسم الدفع من الفاتورة.')}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addBankAccount}>
                <PlusCircle className="me-1 h-3.5 w-3.5" /> {tr('Add account', 'إضافة حساب')}
              </Button>
            </div>
            {bankAccounts.length === 0 && <p className="text-xs text-muted-foreground">{tr('No bank accounts added.', 'لم تتم إضافة حسابات بنكية.')}</p>}
            <div className="space-y-3">
              {bankAccounts.map((bank) => (
                <div key={bank.id} className="rounded border bg-muted/20 p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input className="h-8" value={bank.bankName ?? ''} onChange={(e) => updateBankAccount(bank.id, { bankName: e.target.value })} placeholder={tr('Bank name', 'اسم البنك')} />
                    <Input className="h-8" value={bank.accountHolder ?? ''} onChange={(e) => updateBankAccount(bank.id, { accountHolder: e.target.value })} placeholder={tr('Account holder', 'صاحب الحساب')} />
                    <Input className="h-8" value={bank.accountNumber ?? ''} onChange={(e) => updateBankAccount(bank.id, { accountNumber: e.target.value })} placeholder={tr('Account number', 'رقم الحساب')} />
                    <Input className="h-8" value={bank.iban ?? ''} onChange={(e) => updateBankAccount(bank.id, { iban: e.target.value })} placeholder="IBAN" />
                    <Input className="h-8" value={bank.swift ?? ''} onChange={(e) => updateBankAccount(bank.id, { swift: e.target.value })} placeholder="SWIFT / BIC" />
                    <Input className="h-8" value={bank.currency ?? ''} onChange={(e) => updateBankAccount(bank.id, { currency: e.target.value })} placeholder={tr('Currency (e.g. USD)', 'العملة (مثل USD)')} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1" onClick={() => removeBankAccount(bank.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> {tr('Remove', 'إزالة')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* QR code */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-semibold">{tr('QR code', 'رمز الاستجابة السريعة')}</Label>
                <p className="text-xs text-muted-foreground">{tr('A scannable code linking to a public, downloadable copy of the invoice.', 'رمز قابل للمسح يربط بنسخة عامة قابلة للتنزيل من الفاتورة.')}</p>
              </div>
              <Switch checked={form.qrEnabled !== false} onCheckedChange={(v) => updateForm('qrEnabled', v)} />
            </div>
            {form.qrEnabled !== false && (
              <div className="space-y-1 max-w-[200px]">
                <Label className="text-xs">{tr('Footer position', 'موضع التذييل')}</Label>
                <Select value={form.qrPosition || 'center'} onValueChange={(v) => updateForm('qrPosition', v as 'left' | 'center' | 'right')}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">{tr('Left', 'يسار')}</SelectItem>
                    <SelectItem value="center">{tr('Center', 'وسط')}</SelectItem>
                    <SelectItem value="right">{tr('Right', 'يمين')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Page placement */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <Label className="text-sm font-semibold">{tr('Page placement', 'توزيع الصفحات')}</Label>
              <p className="text-xs text-muted-foreground">{tr('Push a section onto its own page when printing. Everything from that section onward starts on a new page.', 'دفع قسم إلى صفحة خاصة به عند الطباعة. كل ما يلي ذلك القسم يبدأ في صفحة جديدة.')}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {invoiceSections.map((section) => (
                <label key={section.key} className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-3 py-2 text-sm">
                  <span>{section.label}</span>
                  <Switch
                    checked={(form.sectionBreaks ?? []).includes(section.key)}
                    onCheckedChange={(v) => toggleSectionBreak(section.key, v)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(checked) => updateForm('isDefault', checked)}
              />
              {tr('Default template', 'القالب الافتراضي')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.showCompanyAddress}
                onCheckedChange={(checked) => updateForm('showCompanyAddress', checked)}
              />
              {tr('Show company address', 'إظهار عنوان الشركة')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.showTaxId}
                onCheckedChange={(checked) => updateForm('showTaxId', checked)}
              />
              {tr('Show tax ID', 'إظهار الرقم الضريبي')}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={form.watermarkEnabled}
                onCheckedChange={(checked) => updateForm('watermarkEnabled', checked)}
              />
              <Label>{tr('Enable watermark', 'تفعيل العلامة المائية')}</Label>
            </div>
            <div className="space-y-1">
              <Label>{tr('Watermark Text', 'نص العلامة المائية')}</Label>
              <Input
                value={form.watermarkText || ''}
                onChange={(event) => updateForm('watermarkText', event.target.value)}
                placeholder="DRAFT"
              />
            </div>
            <div className="space-y-1">
              <Label>{tr('Watermark Opacity', 'شفافية العلامة المائية')} ({Math.round((form.watermarkOpacity ?? 0.12) * 100)}%)</Label>
              <Input
                type="range"
                min="0.05"
                max="0.4"
                step="0.01"
                value={form.watermarkOpacity ?? 0.12}
                onChange={(event) => updateForm('watermarkOpacity', Number(event.target.value))}
              />
            </div>
          </div>

          <InvoiceTemplatePreview template={form} />
        </CardContent>
      </Card>
    </div>
  );
}
