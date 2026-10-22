'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/context/i18n-context';

const SHOW_EVENT = 'taskflow:password-link';
type Detail = { name: string; link: string; purpose: 'invite' | 'reset' };

/** When the email could not go out: show the admin the link to pass on themselves. */
export function showPasswordLink(detail: Detail) {
  window.dispatchEvent(new CustomEvent<Detail>(SHOW_EVENT, { detail }));
}

export function PasswordLinkDialogHost() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const on = (e: Event) => { setCopied(false); setDetail((e as CustomEvent<Detail>).detail); };
    window.addEventListener(SHOW_EVENT, on);
    return () => window.removeEventListener(SHOW_EVENT, on);
  }, []);

  const copy = async () => {
    if (!detail) return;
    try { await navigator.clipboard.writeText(detail.link); setCopied(true); } catch { /* the field stays selectable */ }
  };

  return (
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('The email could not be sent', 'تعذّر إرسال البريد')}</DialogTitle>
          <DialogDescription>
            {detail?.purpose === 'invite'
              ? tr(`Send this link to ${detail?.name} yourself (WhatsApp or in person) so they can set their password. It works once, for 72 hours.`,
                  `أرسل هذا الرابط إلى ${detail?.name} بنفسك (واتساب أو مباشرة) ليعيّن كلمة المرور. يعمل مرة واحدة لمدة 72 ساعة.`)
              : tr(`Send this link to ${detail?.name} yourself so they can set a new password. It works once, for 1 hour.`,
                  `أرسل هذا الرابط إلى ${detail?.name} بنفسك ليعيّن كلمة مرور جديدة. يعمل مرة واحدة لمدة ساعة.`)}
          </DialogDescription>
        </DialogHeader>
        <Input readOnly value={detail?.link ?? ''} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <DialogFooter>
          <Button onClick={() => void copy()} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? tr('Copied', 'تم النسخ') : tr('Copy link', 'نسخ الرابط')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
