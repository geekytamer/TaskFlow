'use client';

import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import type { RecordAttachment, RecordEntityType, RecordTimelineItem } from '@/modules/finance/types';
import {
  createRecordAttachment,
  deleteRecordAttachment,
  downloadRecordAttachment,
  getRecordAttachments,
  getRecordTimeline,
  readFileAsDataUrl,
  viewRecordAttachment,
} from '@/services/financeService';
import { Download, Eye, FileText, Link as LinkIcon, Paperclip, Trash2 } from 'lucide-react';

/** Files larger than this can't be stored inline; keep in step with the API limit. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface RecordSupportPanelProps {
  companyId?: string;
  entityType: RecordEntityType;
  entityId: string;
  title?: string;
  compact?: boolean;
}

export function RecordSupportPanel({
  companyId,
  entityType,
  entityId,
  title,
  compact = false,
}: RecordSupportPanelProps) {
  const { currentRole } = useCompany();
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const resolvedTitle = title ?? tr('Attachments & Timeline', 'المرفقات والسجل الزمني');
  const resolvedCompanyId = companyId || '';
  const [attachments, setAttachments] = React.useState<RecordAttachment[]>([]);
  const [timeline, setTimeline] = React.useState<RecordTimelineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [fileName, setFileName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [note, setNote] = React.useState('');
  const [localFile, setLocalFile] = React.useState<File | null>(null);

  const canDelete = currentRole === 'Admin' || currentRole === 'Manager' || currentRole === 'Accountant';

  const load = React.useCallback(async () => {
    if (!resolvedCompanyId || !entityId) {
      setAttachments([]);
      setTimeline([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [attachmentData, timelineData] = await Promise.all([
        getRecordAttachments(resolvedCompanyId, entityType, entityId),
        getRecordTimeline(resolvedCompanyId, entityType, entityId, { limit: compact ? 8 : 25 }),
      ]);
      setAttachments(attachmentData);
      setTimeline(timelineData);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Record history unavailable', 'سجل السجلّ غير متاح'),
        description: error?.message || tr('Could not load attachments or timeline.', 'تعذّر تحميل المرفقات أو السجل الزمني.'),
      });
    } finally {
      setLoading(false);
    }
  }, [compact, entityId, entityType, resolvedCompanyId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleLocalFile = (file: File | null) => {
    setLocalFile(file);
    if (file && !fileName) {
      setFileName(file.name);
    }
  };

  const handleAddAttachment = async () => {
    if (!resolvedCompanyId || !entityId) return;
    const finalFileName = fileName.trim() || localFile?.name || '';
    if (!finalFileName) {
      toast({
        variant: 'destructive',
        title: tr('Missing file name', 'اسم الملف مفقود'),
        description: tr('Add a file name, choose a file, or paste a link.', 'أضف اسم ملف أو اختر ملفاً أو الصق رابطاً.'),
      });
      return;
    }
    if (localFile && localFile.size > MAX_ATTACHMENT_BYTES) {
      toast({
        variant: 'destructive',
        title: tr('File too large', 'الملف كبير جداً'),
        description: tr('Attachments must be 20 MB or smaller.', 'يجب أن يكون حجم المرفق 20 ميغابايت أو أقل.'),
      });
      return;
    }
    setSaving(true);
    try {
      const contentBase64 = localFile ? await readFileAsDataUrl(localFile) : undefined;
      await createRecordAttachment(resolvedCompanyId, entityType, entityId, {
        fileName: finalFileName,
        url: url.trim() || undefined,
        mimeType: localFile?.type || undefined,
        sizeBytes: localFile?.size,
        note: note.trim() || undefined,
        contentBase64,
      });
      setFileName('');
      setUrl('');
      setNote('');
      setLocalFile(null);
      await load();
      toast({ title: tr('Attachment added', 'تمت إضافة المرفق') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Attachment failed', 'فشلت إضافة المرفق'),
        description: error?.message || tr('Could not add attachment.', 'تعذّرت إضافة المرفق.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleView = async (attachment: RecordAttachment) => {
    try {
      await viewRecordAttachment(attachment.id);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not open file', 'تعذّر فتح الملف'),
        description: error?.message,
      });
    }
  };

  const handleDownload = async (attachment: RecordAttachment) => {
    try {
      await downloadRecordAttachment(attachment.id, attachment.fileName);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Download failed', 'فشل التنزيل'),
        description: error?.message,
      });
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteRecordAttachment(attachmentId);
      await load();
      toast({ title: tr('Attachment removed', 'تمت إزالة المرفق') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Delete failed', 'فشل الحذف'),
        description: error?.message || tr('Could not remove attachment.', 'تعذّرت إزالة المرفق.'),
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          {resolvedTitle}
        </CardTitle>
        <CardDescription>
          {tr('Attach files or links and review the audit history for this record.', 'أرفق ملفات أو روابط وراجع سجل التدقيق لهذا السجل.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label>{tr('Local File', 'ملف محلي')}</Label>
            <Input type="file" onChange={(event) => handleLocalFile(event.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1">
            <Label>{tr('File Name', 'اسم الملف')}</Label>
            <Input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="receipt.pdf" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAddAttachment} disabled={saving}>
              {saving ? tr('Adding...', 'جارٍ الإضافة...') : tr('Add', 'إضافة')}
            </Button>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{tr('External Link', 'رابط خارجي')}</Label>
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>{tr('Note', 'ملاحظة')}</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={tr('What is this attachment for?', 'لماذا هذا المرفق؟')} />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            {tr('Choose a file to store it here (viewable and downloadable, up to 20 MB), or paste an external link instead.', 'اختر ملفاً لتخزينه هنا (قابل للعرض والتنزيل، حتى 20 ميغابايت)، أو الصق رابطاً خارجياً بدلاً من ذلك.')}
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{tr('Attachments', 'المرفقات')}</h4>
          {attachments.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {tr('No attachments yet.', 'لا توجد مرفقات بعد.')}
            </div>
          ) : (
            attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{attachment.fileName}</span>
                    {attachment.hasContent && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleView(attachment)}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          {tr('View', 'عرض')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(attachment)}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {tr('Download', 'تنزيل')}
                        </button>
                      </>
                    )}
                    {attachment.url && (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <LinkIcon className="h-3 w-3" />
                        {tr('Open link', 'فتح الرابط')}
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {attachment.uploadedByName || tr('Unknown user', 'مستخدم غير معروف')} • {formatDistanceToNow(attachment.createdAt, { addSuffix: true })}
                    {attachment.sizeBytes ? ` • ${(attachment.sizeBytes / 1024).toFixed(1)} KB` : ''}
                  </p>
                  {attachment.note && <p className="text-sm text-muted-foreground">{attachment.note}</p>}
                </div>
                {canDelete && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(attachment.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{tr('Timeline', 'السجل الزمني')}</h4>
          {timeline.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {tr('No timeline activity yet.', 'لا يوجد نشاط في السجل الزمني بعد.')}
            </div>
          ) : (
            timeline.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex gap-3 rounded-md border p-3">
                <Badge variant={item.type === 'attachment' ? 'default' : 'outline'}>{item.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.actorName || tr('System', 'النظام')} • {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </p>
                  {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
