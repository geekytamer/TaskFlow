'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api-client';
import { createFollowup } from '@/services/crmService';
import { Loader2 } from 'lucide-react';

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Turns a WhatsApp message into a task (for me) or a follow-up on the contact,
 * prefilled with the message's words; editable before saving.
 */
export function MessageToWorkDialog({
  open,
  onOpenChange,
  kind,
  companyId,
  userId,
  message,
  chatId,
  who,
  contactId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'task' | 'followup';
  companyId: string;
  userId?: string;
  message: string;
  chatId: string;
  who: string;
  contactId?: string;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const firstLine = message.replace(/\s+/g, ' ').trim();
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState(tomorrow());
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const base = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
    setTitle(base.length >= 2 ? base : `${tr('Reply to', 'الرد على')} ${who}`);
    setDue(tomorrow());
    setNotes(`${tr('From WhatsApp with', 'من واتساب مع')} ${who}:\n${message}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, message]);

  const save = async () => {
    setSaving(true);
    const link = `${window.location.origin}/whatsapp?chat=${encodeURIComponent(chatId)}`;
    try {
      if (kind === 'task') {
        await apiFetch('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            title: title.trim(),
            description: `${notes}\n\n${link}`,
            priority: 'Medium',
            status: 'To Do',
            dueDate: due ? new Date(`${due}T12:00:00`) : undefined,
            assignedUserIds: userId ? [userId] : [],
            createdAt: new Date(),
          }),
        });
      } else if (contactId) {
        await createFollowup(companyId, {
          entityType: 'contact',
          entityId: contactId,
          title: title.trim(),
          channel: 'WhatsApp',
          ownerUserId: userId,
          dueAt: due ? new Date(`${due}T09:00:00`) : undefined,
          notes: `${notes}\n\n${link}`,
        });
      }
      toast({ title: kind === 'task' ? tr('Task created', 'أُنشئت المهمة') : tr('Follow-up created', 'أُنشئت المتابعة') });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'task' ? tr('New task from this message', 'مهمة جديدة من هذه الرسالة') : tr('New follow-up from this message', 'متابعة جديدة من هذه الرسالة')}</DialogTitle>
          <DialogDescription>
            {kind === 'task' ? tr('Assigned to you; it links back to this chat.', 'تُسند إليك، ومعها رابط يعيدك لهذه المحادثة.') : tr(`On ${who}, by WhatsApp; it links back to this chat.`, `على ${who} عبر واتساب، ومعها رابط يعيدك لهذه المحادثة.`)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mtw-title">{tr('Title', 'العنوان')}</Label>
            <Input id="mtw-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mtw-due">{tr('Due', 'الموعد')}</Label>
            <Input id="mtw-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mtw-notes">{tr('Details', 'التفاصيل')}</Label>
            <Textarea id="mtw-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save} disabled={saving || title.trim().length < 2}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {tr('Create', 'إنشاء')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
