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
import type { RecordAttachment, RecordEntityType, RecordTimelineItem } from '@/modules/finance/types';
import {
  createRecordAttachment,
  deleteRecordAttachment,
  getRecordAttachments,
  getRecordTimeline,
} from '@/services/financeService';
import { FileText, Link as LinkIcon, Paperclip, Trash2 } from 'lucide-react';

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
  title = 'Attachments & Timeline',
  compact = false,
}: RecordSupportPanelProps) {
  const { currentRole } = useCompany();
  const { toast } = useToast();
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
        title: 'Record history unavailable',
        description: error?.message || 'Could not load attachments or timeline.',
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
        title: 'Missing file name',
        description: 'Add a file name or choose a local file.',
      });
      return;
    }
    setSaving(true);
    try {
      await createRecordAttachment(resolvedCompanyId, entityType, entityId, {
        fileName: finalFileName,
        url: url.trim() || undefined,
        mimeType: localFile?.type || undefined,
        sizeBytes: localFile?.size,
        note: note.trim() || undefined,
      });
      setFileName('');
      setUrl('');
      setNote('');
      setLocalFile(null);
      await load();
      toast({ title: 'Attachment added' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Attachment failed',
        description: error?.message || 'Could not add attachment.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteRecordAttachment(attachmentId);
      await load();
      toast({ title: 'Attachment removed' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Could not remove attachment.',
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
          {title}
        </CardTitle>
        <CardDescription>
          Attach files or links and review the audit history for this record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label>Local File</Label>
            <Input type="file" onChange={(event) => handleLocalFile(event.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1">
            <Label>File Name</Label>
            <Input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="receipt.pdf" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAddAttachment} disabled={saving}>
              {saving ? 'Adding...' : 'Add'}
            </Button>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>External Link</Label>
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>Note</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What is this attachment for?" />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">
            Local files are recorded as metadata for now. Add a URL when the file is stored in Drive, S3, or another document system.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Attachments</h4>
          {attachments.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No attachments yet.
            </div>
          ) : (
            attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{attachment.fileName}</span>
                    {attachment.url && (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <LinkIcon className="h-3 w-3" />
                        Open
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {attachment.uploadedByName || 'Unknown user'} • {formatDistanceToNow(attachment.createdAt, { addSuffix: true })}
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
          <h4 className="text-sm font-semibold">Timeline</h4>
          {timeline.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No timeline activity yet.
            </div>
          ) : (
            timeline.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex gap-3 rounded-md border p-3">
                <Badge variant={item.type === 'attachment' ? 'default' : 'outline'}>{item.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.actorName || 'System'} • {formatDistanceToNow(item.createdAt, { addSuffix: true })}
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
