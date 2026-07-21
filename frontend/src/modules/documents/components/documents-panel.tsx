'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getDocumentTemplates, deleteDocumentTemplate,
  getDocuments, deleteDocument, downloadDocumentPdf,
} from '@/services/documentService';
import type { DocumentTemplate, DocumentInstance } from '@/modules/documents/types';
import { DocumentTemplateEditor } from './document-template-editor';
import { DocumentComposer } from './document-composer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Trash2, Pencil, FileText, FilePlus2, Download } from 'lucide-react';

type View =
  | { mode: 'list' }
  | { mode: 'edit-template'; template: DocumentTemplate | null }
  | { mode: 'compose'; template: DocumentTemplate };

export function DocumentsPanel() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [templates, setTemplates] = React.useState<DocumentTemplate[]>([]);
  const [documents, setDocuments] = React.useState<DocumentInstance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<View>({ mode: 'list' });
  const [composeTemplateId, setComposeTemplateId] = React.useState('');

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [t, d] = await Promise.all([getDocumentTemplates(companyId), getDocuments(companyId)]);
      setTemplates(t); setDocuments(d);
    } catch { setTemplates([]); setDocuments([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const removeTemplate = async (id: string) => {
    const ok = await confirm({ title: tr('Delete template?', 'حذف القالب؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteDocumentTemplate(id); load(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };
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

  if (view.mode === 'edit-template') {
    return (
      <Card><CardContent className="pt-6">
        <DocumentTemplateEditor template={view.template} onBack={() => setView({ mode: 'list' })} onSaved={() => { setView({ mode: 'list' }); load(); }} />
      </CardContent></Card>
    );
  }
  if (view.mode === 'compose') {
    return (
      <Card><CardContent className="pt-6">
        <DocumentComposer template={view.template} onBack={() => setView({ mode: 'list' })} onSaved={() => { setView({ mode: 'list' }); load(); }} />
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Documents', 'المستندات')}</CardTitle>
        <CardDescription>
          {tr('Design letterhead-backed templates with merge fields, then generate documents from them.',
              'صمّم قوالب بترويسة وحقول دمج، ثم أنشئ المستندات منها.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <Tabs defaultValue="templates" className="space-y-4">
            <TabsList>
              <TabsTrigger value="templates">{tr('Templates', 'القوالب')}</TabsTrigger>
              <TabsTrigger value="documents">{tr('Documents', 'المستندات')}</TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="space-y-3">
              <div className="flex justify-end">
                <Button onClick={() => setView({ mode: 'edit-template', template: null })}><Plus className="me-2 h-4 w-4" />{tr('New template', 'قالب جديد')}</Button>
              </div>
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{tr('No templates yet.', 'لا توجد قوالب بعد.')}</p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{tr('Name', 'الاسم')}</TableHead>
                      <TableHead>{tr('Type', 'النوع')}</TableHead>
                      <TableHead>{tr('Merges', 'الدمج')}</TableHead>
                      <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {templates.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="secondary">{t.type}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{t.dataSource === 'none' ? '—' : t.dataSource}</TableCell>
                          <TableCell className="text-end">
                            <Button variant="ghost" size="sm" onClick={() => setView({ mode: 'compose', template: t })}><FilePlus2 className="me-1 h-4 w-4" />{tr('Use', 'استخدام')}</Button>
                            <Button variant="ghost" size="icon" onClick={() => setView({ mode: 'edit-template', template: t })}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => removeTemplate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents" className="space-y-3">
              {templates.length > 0 && (
                <div className="flex items-end gap-2">
                  <Select value={composeTemplateId} onValueChange={setComposeTemplateId}>
                    <SelectTrigger className="w-64"><SelectValue placeholder={tr('Pick a template', 'اختر قالباً')} /></SelectTrigger>
                    <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button disabled={!composeTemplateId} onClick={() => {
                    const t = templates.find((x) => x.id === composeTemplateId);
                    if (t) setView({ mode: 'compose', template: t });
                  }}><Plus className="me-2 h-4 w-4" />{tr('New document', 'مستند جديد')}</Button>
                </div>
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
  );
}
