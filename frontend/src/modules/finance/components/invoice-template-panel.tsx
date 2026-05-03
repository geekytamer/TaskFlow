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
import { useToast } from '@/hooks/use-toast';
import {
  createInvoiceTemplate,
  deleteInvoiceTemplate,
  getInvoiceTemplates,
  updateInvoiceTemplate,
} from '@/services/financeService';
import type { InvoiceTemplateInput } from '@/services/financeService';
import type { InvoiceTemplate, InvoiceTemplateLayout } from '../types';
import { useCompanyCurrency } from '@/lib/currency';

const emptyForm: InvoiceTemplateInput = {
  name: '',
  layout: 'classic',
  isDefault: false,
  primaryColor: '#111827',
  accentColor: '#2563eb',
  logoUrl: '',
  headerImageUrl: '',
  footerImageUrl: '',
  letterheadPdfUrl: '',
  paymentInstructions: '',
  terms: '',
  footerNote: '',
  watermarkEnabled: false,
  watermarkText: 'DRAFT',
  watermarkOpacity: 0.12,
  showCompanyAddress: true,
  showTaxId: true,
};

const layoutLabels: Record<InvoiceTemplateLayout, string> = {
  classic: 'Classic',
  modern: 'Modern',
  compact: 'Compact',
  letterhead: 'Letterhead',
};

const toForm = (template: InvoiceTemplate): InvoiceTemplateInput => ({
  name: template.name,
  layout: template.layout,
  isDefault: template.isDefault,
  primaryColor: template.primaryColor,
  accentColor: template.accentColor,
  logoUrl: template.logoUrl || '',
  headerImageUrl: template.headerImageUrl || '',
  footerImageUrl: template.footerImageUrl || '',
  letterheadPdfUrl: template.letterheadPdfUrl || '',
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
  logoUrl: form.logoUrl?.trim() || undefined,
  headerImageUrl: form.headerImageUrl?.trim() || undefined,
  footerImageUrl: form.footerImageUrl?.trim() || undefined,
  letterheadPdfUrl: form.letterheadPdfUrl?.trim() || undefined,
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
            Clear
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
        <p className="text-xs text-muted-foreground">PDF uploaded</p>
      )}
    </div>
  );
}

const sampleInvoice = {
  number: 'INV-0042',
  issueDate: 'Apr 19, 2026',
  dueDate: 'May 19, 2026',
  client: {
    name: 'Acme Trading LLC',
    address: 'Muscat Business District\nSultanate of Oman',
  },
  company: {
    name: 'Your Company',
    address: 'Company address line\nCity, Country',
    taxId: 'VAT / Tax ID: OM1234567',
  },
  lines: [
    { description: 'Project implementation', quantity: 1, unitPrice: 1200, amount: 1200 },
    { description: 'Support retainer', quantity: 2, unitPrice: 250, amount: 500 },
    { description: 'On-site consultation', quantity: 3, unitPrice: 150, amount: 450 },
  ],
};

function InvoiceTemplatePreview({ template }: { template: InvoiceTemplateInput }) {
  const { money, amount } = useCompanyCurrency();
  const subtotal = sampleInvoice.lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = Number((subtotal * 0.05).toFixed(2));
  const total = subtotal + tax;
  const compact = template.layout === 'compact';
  const modern = template.layout === 'modern';
  const letterhead = template.layout === 'letterhead';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Preview</h3>
        <Badge variant="outline">{layoutLabels[template.layout]}</Badge>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-muted/30 p-3">
        <div
          className="relative mx-auto min-h-[760px] w-full max-w-[720px] overflow-hidden rounded-sm bg-white text-slate-950 shadow-sm"
          style={{
            borderTop: letterhead ? `10px solid ${template.primaryColor}` : undefined,
            backgroundImage: template.letterheadPdfUrl
              ? `linear-gradient(rgba(255,255,255,0.86), rgba(255,255,255,0.86)), url("${template.letterheadPdfUrl}")`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
          }}
        >
          {template.watermarkEnabled && template.watermarkText && (
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            >
              <span
                className="select-none text-7xl font-extrabold uppercase"
                style={{
                  color: template.primaryColor,
                  opacity: template.watermarkOpacity ?? 0.12,
                  transform: 'rotate(-30deg)',
                }}
              >
                {template.watermarkText}
              </span>
            </div>
          )}
          {template.headerImageUrl && (
            <img
              src={template.headerImageUrl}
              alt=""
              className="h-20 w-full object-cover"
            />
          )}

          <div className={compact ? 'p-8' : 'p-10'}>
            <div
              className={`flex gap-6 ${modern ? 'items-start justify-between border-b pb-8' : 'items-start justify-between'}`}
              style={{ borderColor: template.accentColor }}
            >
              <div className="min-w-0">
                {template.logoUrl ? (
                  <img
                    src={template.logoUrl}
                    alt=""
                    className="mb-4 h-14 max-w-44 object-contain object-left"
                  />
                ) : (
                  <div
                    className="mb-4 flex h-14 w-40 items-center justify-center rounded border text-sm font-semibold"
                    style={{ borderColor: template.accentColor, color: template.primaryColor }}
                  >
                    LOGO
                  </div>
                )}
                <div className="font-semibold" style={{ color: template.primaryColor }}>
                  {sampleInvoice.company.name}
                </div>
                {template.showCompanyAddress && (
                  <div className="mt-1 whitespace-pre-line text-sm text-slate-500">
                    {sampleInvoice.company.address}
                  </div>
                )}
                {template.showTaxId && (
                  <div className="mt-1 text-sm text-slate-500">{sampleInvoice.company.taxId}</div>
                )}
              </div>

              <div
                className={modern ? 'rounded-sm px-5 py-4 text-right text-white' : 'text-right'}
                style={modern ? { backgroundColor: template.primaryColor } : undefined}
              >
                <div
                  className="text-3xl font-bold tracking-normal"
                  style={modern ? undefined : { color: template.primaryColor }}
                >
                  INVOICE
                </div>
                <div className={modern ? 'mt-2 text-sm text-white/85' : 'mt-2 text-sm text-slate-500'}>
                  {sampleInvoice.number}
                </div>
              </div>
            </div>

            <div
              className={`grid gap-6 ${compact ? 'mt-8 grid-cols-3 text-sm' : 'mt-10 grid-cols-2'}`}
            >
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Bill To</div>
                <div className="mt-2 font-semibold">{sampleInvoice.client.name}</div>
                <div className="mt-1 whitespace-pre-line text-sm text-slate-500">
                  {sampleInvoice.client.address}
                </div>
              </div>
              <div className={compact ? 'text-left' : 'text-right'}>
                <div className="grid gap-1 text-sm">
                  <div>
                    <span className="text-slate-500">Issue date: </span>
                    <span className="font-medium">{sampleInvoice.issueDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Due date: </span>
                    <span className="font-medium">{sampleInvoice.dueDate}</span>
                  </div>
                </div>
              </div>
              {compact && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400">Terms</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {template.terms || 'Standard payment terms apply.'}
                  </div>
                </div>
              )}
            </div>

            <div className={compact ? 'mt-8' : 'mt-10'}>
              <div
                className="grid grid-cols-[1fr_80px_110px_110px] gap-3 rounded-t px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: template.primaryColor }}
              >
                <div>Description</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Unit</div>
                <div className="text-right">Amount</div>
              </div>
              <div className="border-x border-b">
                {sampleInvoice.lines.map((line, index) => (
                  <div
                    key={line.description}
                    className={`grid grid-cols-[1fr_80px_110px_110px] gap-3 px-4 py-3 text-sm ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <div>{line.description}</div>
                    <div className="text-right">{line.quantity}</div>
                    <div className="text-right">{amount(line.unitPrice)}</div>
                    <div className="text-right font-medium">{amount(line.amount)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span>{amount(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tax 5%</span>
                  <span>{amount(tax)}</span>
                </div>
                <div
                  className="flex justify-between border-t pt-3 text-lg font-bold"
                  style={{ borderColor: template.accentColor, color: template.primaryColor }}
                >
                  <span>Total</span>
                  <span>{amount(total)}</span>
                </div>
              </div>
            </div>

            {!compact && (
              <div className="mt-10 grid gap-6 text-sm md:grid-cols-2">
                <div>
                  <div className="font-semibold" style={{ color: template.primaryColor }}>
                    Payment
                  </div>
                  <p className="mt-2 text-slate-600">
                    {template.paymentInstructions || 'Payment instructions will appear here.'}
                  </p>
                </div>
                <div>
                  <div className="font-semibold" style={{ color: template.primaryColor }}>
                    Terms
                  </div>
                  <p className="mt-2 text-slate-600">
                    {template.terms || 'Terms and conditions will appear here.'}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-10 border-t pt-4 text-center text-xs text-slate-500">
              {template.footerNote || 'Footer note appears here.'}
            </div>
          </div>

          {template.footerImageUrl && (
            <img
              src={template.footerImageUrl}
              alt=""
              className="h-16 w-full object-cover"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function InvoiceTemplatePanel() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const [templates, setTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>();
  const [form, setForm] = React.useState<InvoiceTemplateInput>(emptyForm);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const loadTemplates = React.useCallback(async () => {
    if (!selectedCompany) {
      setTemplates([]);
      setSelectedTemplateId(undefined);
      setForm(emptyForm);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getInvoiceTemplates(selectedCompany.id);
      setTemplates(data);
      const nextSelected = data.find((template) => template.isDefault) || data[0];
      setSelectedTemplateId(nextSelected?.id);
      setForm(nextSelected ? toForm(nextSelected) : emptyForm);
    } catch (error: any) {
      setTemplates([]);
      toast({
        variant: 'destructive',
        title: 'Templates unavailable',
        description: error?.message || 'Could not load invoice templates.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const updateForm = <K extends keyof InvoiceTemplateInput>(key: K, value: InvoiceTemplateInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectTemplate = (template: InvoiceTemplate) => {
    setSelectedTemplateId(template.id);
    setForm(toForm(template));
  };

  const startNewTemplate = () => {
    setSelectedTemplateId(undefined);
    setForm({ ...emptyForm, name: `Template ${templates.length + 1}` });
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    const payload = cleanForm(form);
    if (!payload.name) {
      toast({
        variant: 'destructive',
        title: 'Template name required',
        description: 'Enter a name before saving the template.',
      });
      return;
    }
    setSaving(true);
    try {
      const saved = selectedTemplateId
        ? await updateInvoiceTemplate(selectedTemplateId, payload)
        : await createInvoiceTemplate(selectedCompany.id, payload);
      const data = await getInvoiceTemplates(selectedCompany.id);
      setTemplates(data);
      setSelectedTemplateId(saved.id);
      setForm(toForm(saved));
      toast({
        title: 'Template saved',
        description: `${saved.name} is ready for new invoices.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error?.message || 'Could not save invoice template.',
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
        title: 'Template deleted',
        description: 'The template was removed.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Could not delete invoice template.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (
    field: 'logoUrl' | 'headerImageUrl' | 'footerImageUrl' | 'letterheadPdfUrl',
    file: File | null,
  ) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload a file smaller than 8 MB.',
      });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateForm(field, dataUrl);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error?.message || 'Could not process selected file.',
      });
    }
  };

  if (!selectedCompany) {
    return (
      <div className="rounded-lg border">
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Select a company to manage invoice templates.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <Button type="button" className="w-full justify-start" onClick={startNewTemplate}>
          <PlusCircle className="me-2 h-4 w-4" />
          New Template
        </Button>
        <div className="space-y-2">
          {loading && (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              Loading templates...
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
                {template.isDefault && <Badge>Default</Badge>}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{layoutLabels[template.layout]}</span>
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
          <CardTitle>{selectedTemplateId ? 'Edit Invoice Template' : 'New Invoice Template'}</CardTitle>
          <div className="flex gap-2">
            {selectedTemplateId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={saving || templates.length <= 1}
              >
                <Trash2 className="me-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              <Check className="me-2 h-4 w-4" />
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Layout</Label>
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
                      {layoutLabels[layout]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Primary Color</Label>
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
              <Label>Accent Color</Label>
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
              label="Logo"
              value={form.logoUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('logoUrl', file)}
              onClear={() => updateForm('logoUrl', '')}
            />
            <AssetUploadField
              label="Header Image"
              value={form.headerImageUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('headerImageUrl', file)}
              onClear={() => updateForm('headerImageUrl', '')}
            />
            <AssetUploadField
              label="Footer Image"
              value={form.footerImageUrl || ''}
              accept="image/*"
              onFileSelected={(file) => handleAssetUpload('footerImageUrl', file)}
              onClear={() => updateForm('footerImageUrl', '')}
            />
            <AssetUploadField
              label="Letterhead Background"
              value={form.letterheadPdfUrl || ''}
              accept="image/*,application/pdf"
              onFileSelected={(file) => handleAssetUpload('letterheadPdfUrl', file)}
              onClear={() => updateForm('letterheadPdfUrl', '')}
              hint="Use image files for visible preview background."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Payment Instructions</Label>
              <Textarea
                value={form.paymentInstructions || ''}
                onChange={(event) => updateForm('paymentInstructions', event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>Terms</Label>
              <Textarea
                value={form.terms || ''}
                onChange={(event) => updateForm('terms', event.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>Footer Note</Label>
              <Textarea
                value={form.footerNote || ''}
                onChange={(event) => updateForm('footerNote', event.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.isDefault}
                onCheckedChange={(checked) => updateForm('isDefault', checked)}
              />
              Default template
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.showCompanyAddress}
                onCheckedChange={(checked) => updateForm('showCompanyAddress', checked)}
              />
              Show company address
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.showTaxId}
                onCheckedChange={(checked) => updateForm('showTaxId', checked)}
              />
              Show tax ID
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={form.watermarkEnabled}
                onCheckedChange={(checked) => updateForm('watermarkEnabled', checked)}
              />
              <Label>Enable watermark</Label>
            </div>
            <div className="space-y-1">
              <Label>Watermark Text</Label>
              <Input
                value={form.watermarkText || ''}
                onChange={(event) => updateForm('watermarkText', event.target.value)}
                placeholder="DRAFT"
              />
            </div>
            <div className="space-y-1">
              <Label>Watermark Opacity ({Math.round((form.watermarkOpacity ?? 0.12) * 100)}%)</Label>
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
