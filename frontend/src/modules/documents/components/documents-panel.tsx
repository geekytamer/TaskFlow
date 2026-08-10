'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getDocuments, deleteDocument, downloadDocumentPdf,
} from '@/services/documentService';
import { getInvoiceTemplates } from '@/services/financeService';
import type { DocumentInstance } from '@/modules/documents/types';
import type { InvoiceTemplate, TemplateDocumentType } from '@/modules/finance/types';
import {
  DOCUMENT_WORKSPACE_TABS,
  getDocumentWorkspaceTab,
} from '@/modules/documents/document-tabs';
import {
  DOCUMENT_CREATION_TYPES,
  DOCUMENT_TEMPLATE_TYPES,
} from '@/modules/documents/document-template-types';
import { chooseTemplateId } from '@/modules/finance/template-selection';
import { DocumentComposer } from './document-composer';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, FileText, Download, LayoutTemplate } from 'lucide-react';

const InvoiceTemplatePanel = dynamic(
  () => import('@/modules/finance/components/invoice-template-panel')
    .then((module) => module.InvoiceTemplatePanel),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
  },
);

type View =
  | { mode: 'list' }
  | { mode: 'compose'; template: InvoiceTemplate };

export function DocumentsPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [templates, setTemplates] = React.useState<InvoiceTemplate[]>([]);
  const [documents, setDocuments] = React.useState<DocumentInstance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<View>({ mode: 'list' });
  const [composeTemplateId, setComposeTemplateId] = React.useState('');
  const [composeType, setComposeType] = React.useState<TemplateDocumentType>('letter');
  const loadRequest = React.useRef(0);
  const activeTab = getDocumentWorkspaceTab(searchParams.get('tab'));
  const requestedTemplateType = searchParams.get('type');
  const activeTemplateType = (
    DOCUMENT_TEMPLATE_TYPES.some((item) => item.value === requestedTemplateType)
      ? requestedTemplateType
      : 'invoice'
  ) as TemplateDocumentType;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('tab', value);
    router.replace(`/documents?${params.toString()}`);
  };

  const handleTemplateTypeChange = (value: TemplateDocumentType) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('tab', 'templates');
    params.set('type', value);
    router.replace(`/documents?${params.toString()}`);
  };

  const load = React.useCallback(async () => {
    const requestId = ++loadRequest.current;
    if (!companyId) {
      setTemplates([]);
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [templateGroups, d] = await Promise.all([
        Promise.all(
          DOCUMENT_CREATION_TYPES.map(({ value }) => getInvoiceTemplates(companyId, value)),
        ),
        getDocuments(companyId),
      ]);
      if (requestId !== loadRequest.current) return;
      setTemplates(templateGroups.flat());
      setDocuments(d);
    } catch {
      if (requestId !== loadRequest.current) return;
      setTemplates([]);
      setDocuments([]);
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [companyId]);

  const creationTemplates = React.useMemo(
    () => templates.filter((template) => template.docType === composeType),
    [composeType, templates],
  );

  React.useEffect(() => {
    setComposeTemplateId((current) => chooseTemplateId(creationTemplates, current));
  }, [creationTemplates]);

  React.useEffect(() => { load(); }, [load]);

  const removeDocument = async (id: string) => {
    const ok = await confirm({ title: tr('Delete document?', 'حذف المستند؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteDocument(id); load(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };
  const downloadPdf = async (id: string, title: string) => {
    try { await downloadDocumentPdf(id, title); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('PDF unavailable', 'PDF غير متاح'), description: e?.message }); }
  };

  if (view.mode === 'compose') {
    return (
      <Card><CardContent className="p-4 sm:p-6">
        <DocumentComposer template={view.template} onBack={() => setView({ mode: 'list' })} onSaved={() => { setView({ mode: 'list' }); load(); }} />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><LayoutTemplate className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-semibold">{DOCUMENT_TEMPLATE_TYPES.length}</p>
              <p className="text-xs text-muted-foreground">{tr('Supported document types', 'أنواع المستندات المدعومة')}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></div>
            <div>
              <p className="text-2xl font-semibold">{loading ? '—' : documents.length}</p>
              <p className="text-xs text-muted-foreground">{tr('Generated documents', 'مستندات تم إنشاؤها')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <div className="overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-max">
                {DOCUMENT_WORKSPACE_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tr(tab.label, tab.labelAr)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="templates" className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="max-w-sm space-y-2">
                  <p className="text-sm font-semibold">{tr('What are you designing?', 'ما نوع المستند الذي تصممه؟')}</p>
                  <Select
                    value={activeTemplateType}
                    onValueChange={(value) => handleTemplateTypeChange(value as TemplateDocumentType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TEMPLATE_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {tr(item.label, item.labelAr)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      'The editor, starter layout, fields, and financial controls adapt to this type.',
                      'يتكيف المحرر والتخطيط الابتدائي والحقول والضوابط المالية مع هذا النوع.',
                    )}
                  </p>
                </div>
              </div>
              <InvoiceTemplatePanel
                key={activeTemplateType}
                docType={activeTemplateType}
                onChanged={load}
              />
            </TabsContent>

            <TabsContent value="documents" className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {tr('Document type', 'نوع المستند')}
                    </p>
                    <Select
                      value={composeType}
                      onValueChange={(value) => setComposeType(value as TemplateDocumentType)}
                    >
                      <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CREATION_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {tr(item.label, item.labelAr)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                {creationTemplates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {tr('Template', 'القالب')}
                    </p>
                  <Select value={composeTemplateId} onValueChange={setComposeTemplateId}>
                    <SelectTrigger className="w-64"><SelectValue placeholder={tr('Pick a template', 'اختر قالباً')} /></SelectTrigger>
                      <SelectContent>
                        {creationTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}{template.isDefault ? tr(' (Default)', ' (افتراضي)') : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                  </Select>
                  </div>
                )}
                  <Button disabled={!composeTemplateId} onClick={() => {
                    const t = templates.find((x) => x.id === composeTemplateId);
                    if (t) setView({ mode: 'compose', template: t });
                  }}><Plus className="me-2 h-4 w-4" />{tr('New document', 'مستند جديد')}</Button>
              </div>
              {creationTemplates.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {tr(
                    'Create a template for this document type before generating a document.',
                    'أنشئ قالباً لهذا النوع قبل إنشاء المستند.',
                  )}
                </p>
              )}
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{tr('No documents yet.', 'لا توجد مستندات بعد.')}</p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{tr('Title', 'العنوان')}</TableHead>
                      <TableHead>{tr('Template', 'القالب')}</TableHead>
                      <TableHead>{tr('Status', 'الحالة')}</TableHead>
                      <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {documents.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.title}</TableCell>
                          <TableCell className="text-muted-foreground">{d.templateName ?? '—'}</TableCell>
                          <TableCell><Badge variant={d.status === 'final' ? 'default' : 'secondary'}>{d.status}</Badge></TableCell>
                          <TableCell className="text-end">
                            <Button variant="ghost" size="sm" onClick={() => downloadPdf(d.id, d.title)}><Download className="me-1 h-4 w-4" />{tr('PDF', 'PDF')}</Button>
                            <Button variant="ghost" size="icon" onClick={() => removeDocument(d.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
