'use client';

import * as React from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { isApiError } from '@/lib/api-client';
import { emailInvoice } from '@/services/clientEmailService';

/** Sends an issued invoice to the client by email, with a link to view it. */
export function EmailInvoiceButton({ invoiceId, invoiceNumber, defaultTo }: { invoiceId: string; invoiceNumber: string; defaultTo?: string }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(defaultTo ?? '');
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  React.useEffect(() => { if (open) { setTo(defaultTo ?? ''); setMessage(''); } }, [open, defaultTo]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Mail className="me-2 h-4 w-4" />{tr('Email to client', 'إرسال للعميل بالبريد')}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr(`Email ${invoiceNumber}`, `إرسال ${invoiceNumber} بالبريد`)}</DialogTitle>
            <DialogDescription>{tr('The client gets the amount due, the due date and a link to view and print the invoice.', 'يصل العميل المبلغ المستحق وتاريخ الاستحقاق ورابط لعرض الفاتورة وطباعتها.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="ei-to">{tr('To', 'إلى')}</Label><Input id="ei-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ei-msg">{tr('Message (optional)', 'رسالة (اختياري)')}</Label><Textarea id="ei-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button disabled={sending || !to.trim()} onClick={async () => {
              setSending(true);
              try {
                await emailInvoice(invoiceId, { to: to.trim(), message: message.trim() || undefined });
                toast({ title: tr(`Sent to ${to.trim()}`, `أُرسلت إلى ${to.trim()}`) });
                setOpen(false);
              } catch (error) {
                const notSetUp = isApiError(error) && (error.details as { emailConfigured?: boolean } | undefined)?.emailConfigured === false;
                toast({
                  variant: 'destructive',
                  title: notSetUp ? tr('Email is not set up on this server yet', 'لم يُضبط البريد على هذا الخادم بعد') : tr('Not sent', 'لم تُرسل'),
                  description: notSetUp ? tr('Ask your administrator to add the email provider key. You can still download the PDF and send it yourself.', 'اطلب من مسؤول النظام إضافة مفتاح مزوّد البريد. ويمكنك تنزيل الملف وإرساله بنفسك.') : (error as Error)?.message,
                });
              } finally { setSending(false); }
            }}>{tr('Send', 'إرسال')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
