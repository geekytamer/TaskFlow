'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { isApiError } from '@/lib/api-client';
import { sendWhatsappDocument } from '@/services/whatsappService';
import { Loader2, Send } from 'lucide-react';

/**
 * "Send by WhatsApp" for a quotation or an invoice: the same PDF as the
 * download, to the document's contact, with a short message the person can edit.
 */
export function SendDocumentDialog({
  open,
  onOpenChange,
  kind,
  id,
  number,
  defaultPhone,
  documentLanguage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'quotation' | 'invoice';
  id: string;
  number: string;
  defaultPhone?: string;
  documentLanguage?: string;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const lang = documentLanguage || language;
  const defaultCaption = lang.startsWith('ar')
    ? `مرحباً، تجدون مرفقاً ${kind === 'quotation' ? 'عرض السعر' : 'الفاتورة'} رقم ${number}.`
    : `Hello, please find attached ${kind} ${number}.`;
  const [phone, setPhone] = React.useState(defaultPhone ?? '');
  const [caption, setCaption] = React.useState(defaultCaption);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPhone(defaultPhone ?? '');
    setCaption(defaultCaption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const send = async () => {
    if (!selectedCompany?.id) return;
    setSending(true);
    try {
      await sendWhatsappDocument(selectedCompany.id, { kind, id, phone: phone.trim() || undefined, caption: caption.trim() || undefined, language: lang });
      toast({
        title: tr('Sent by WhatsApp', 'أُرسل عبر واتساب'),
        description: tr('You will find it in the WhatsApp inbox.', 'تجده في صندوق واتساب.'),
      });
      onOpenChange(false);
    } catch (error: any) {
      const windowClosed = isApiError(error) && (error.details as { code?: string } | undefined)?.code === 'windowClosed';
      toast({
        variant: 'destructive',
        title: tr('Not sent', 'لم يُرسل'),
        description: windowClosed
          ? tr('This customer has not written in the last 24 hours. Send them an approved template from the WhatsApp inbox first.', 'هذا العميل لم يراسلكم خلال آخر ٢٤ ساعة. أرسل له قالباً معتمداً من صندوق واتساب أولاً.')
          : error?.message,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === 'quotation' ? tr(`Send quotation ${number} by WhatsApp`, `إرسال عرض السعر ${number} عبر واتساب`) : tr(`Send invoice ${number} by WhatsApp`, `إرسال الفاتورة ${number} عبر واتساب`)}
          </DialogTitle>
          <DialogDescription>{tr('The PDF goes with the message below.', 'يُرسل ملف PDF مع الرسالة أدناه.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="doc-wa-phone">{tr('WhatsApp number', 'رقم واتساب')}</Label>
            <Input id="doc-wa-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+968 9xxx xxxx" />
            {!defaultPhone && <p className="text-xs text-muted-foreground">{tr('The contact has no phone saved.', 'لا يوجد رقم محفوظ لجهة الاتصال.')}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-wa-caption">{tr('Message', 'الرسالة')}</Label>
            <Textarea id="doc-wa-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={send} disabled={sending || !phone.replace(/\D/g, '')}>
            {sending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
            {tr('Send', 'إرسال')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
