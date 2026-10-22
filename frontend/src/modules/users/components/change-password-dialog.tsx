'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { changeOwnPassword } from '@/services/authService';

const MIN = 8;

/** The signed-in person changes their own password; their other devices are signed out. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) { setCurrent(''); setNext(''); setConfirm(''); setError(null); }
  }, [open]);

  const valid = current.length > 0 && next.length >= MIN && next === confirm;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await changeOwnPassword(current, next);
      toast({ title: tr('Password changed', 'تم تغيير كلمة المرور'), description: tr('Your other devices were signed out.', 'تم تسجيل الخروج من أجهزتك الأخرى.') });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('That did not work.', 'لم تنجح العملية.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('Change password', 'تغيير كلمة المرور')}</DialogTitle>
          <DialogDescription>{tr('You stay signed in here; other devices are signed out.', 'تبقى مسجلاً هنا، ويتم تسجيل الخروج من أجهزتك الأخرى.')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3 py-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1">
            <Label htmlFor="current-password">{tr('Current password', 'كلمة المرور الحالية')}</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">{tr("Don't know it?", 'لا تعرفها؟')}</Link>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-password">{tr('New password', 'كلمة المرور الجديدة')}</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className={next.length > 0 && next.length < MIN ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{tr(`At least ${MIN} characters.`, `${MIN} أحرف على الأقل.`)}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-password">{tr('Type it again', 'أعد كتابتها')}</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {confirm.length > 0 && confirm !== next && <p className="text-xs text-destructive">{tr('The two passwords are different.', 'كلمتا المرور غير متطابقتين.')}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="submit" disabled={busy || !valid}>{busy ? tr('Saving…', 'جارٍ الحفظ…') : tr('Change password', 'تغيير كلمة المرور')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
