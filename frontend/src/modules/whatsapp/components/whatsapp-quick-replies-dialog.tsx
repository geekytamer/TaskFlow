'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  deleteWhatsappQuickReply,
  saveWhatsappQuickReply,
  type WhatsAppQuickReply,
} from '@/services/whatsappService';
import { Pencil, Trash2 } from 'lucide-react';

/** Manage the company's saved replies: a short code and its text. */
export function WhatsappQuickRepliesDialog({
  open,
  onOpenChange,
  companyId,
  replies,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  replies: WhatsAppQuickReply[];
  onChanged: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<{ id?: string; shortcut: string; body: string }>({ shortcut: '', body: '' });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) setEditing({ shortcut: '', body: '' });
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await saveWhatsappQuickReply(companyId, editing);
      setEditing({ shortcut: '', body: '' });
      onChanged();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteWhatsappQuickReply(companyId, id);
      onChanged();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete', 'تعذّر الحذف'), description: error?.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('Quick replies', 'الردود الجاهزة')}</DialogTitle>
          <DialogDescription>
            {tr('Type / at the start of a message to insert one. You can still edit it before sending.', 'اكتب / في بداية الرسالة لإدراج رد جاهز، ويمكنك تعديله قبل الإرسال.')}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {replies.length === 0 && <p className="text-sm text-muted-foreground">{tr('No quick replies yet.', 'لا توجد ردود جاهزة بعد.')}</p>}
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border p-2">
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs" dir="auto">/{r.shortcut}</code>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs">{r.body}</p>
              <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setEditing({ id: r.id, shortcut: r.shortcut, body: r.body })} aria-label={tr('Edit', 'تعديل')}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => remove(r.id)} aria-label={tr('Delete', 'حذف')}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor="qr-code">{tr('Short code', 'الاختصار')}</Label>
            <Input id="qr-code" value={editing.shortcut} maxLength={30} onChange={(e) => setEditing((p) => ({ ...p, shortcut: e.target.value }))} placeholder={tr('price', 'سعر')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qr-body">{tr('Text', 'النص')}</Label>
            <Textarea id="qr-body" rows={3} maxLength={4000} value={editing.body} onChange={(e) => setEditing((p) => ({ ...p, body: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            {editing.id && (
              <Button variant="outline" onClick={() => setEditing({ shortcut: '', body: '' })}>
                {tr('Cancel', 'إلغاء')}
              </Button>
            )}
            <Button onClick={save} disabled={saving || !editing.shortcut.trim() || !editing.body.trim()}>
              {editing.id ? tr('Save changes', 'حفظ التعديل') : tr('Add', 'إضافة')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
