'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/i18n-context';
import { BrandMark } from '@/modules/branding/brand-mark';
import { StagingBanner } from '@/modules/layout/components/staging-banner';
import { checkPasswordLink, setPasswordWithLink } from '@/services/authService';

const MIN = 8;

/** Where an invitation or reset link lands: choose a password, then straight in. */
function SetPasswordInner() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [link, setLink] = React.useState<{ purpose: 'invite' | 'reset'; name: string; email: string } | null | 'bad'>(null);
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) { setLink('bad'); return; }
    checkPasswordLink(token).then(setLink).catch(() => setLink('bad'));
  }, [token]);

  const tooShort = password.length > 0 && password.length < MIN;
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await setPasswordWithLink(token, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('That did not work. Try again.', 'لم تنجح العملية. حاول مرة أخرى.'));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StagingBanner />
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="mx-auto w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <BrandMark logoClassName="h-10 w-10" nameClassName="text-3xl font-bold text-primary font-headline" />
            </div>
            {link === 'bad' ? (
              <>
                <CardTitle className="text-xl">{tr('This link no longer works', 'هذا الرابط لم يعد صالحاً')}</CardTitle>
                <CardDescription>{tr('It expired or was already used. Ask for a new one.', 'انتهت صلاحيته أو استُخدم من قبل. اطلب رابطاً جديداً.')}</CardDescription>
              </>
            ) : link ? (
              <>
                <CardTitle className="text-xl">
                  {link.purpose === 'invite' ? tr(`Welcome, ${link.name}`, `أهلاً ${link.name}`) : tr('Set a new password', 'تعيين كلمة مرور جديدة')}
                </CardTitle>
                <CardDescription>
                  {link.purpose === 'invite'
                    ? tr('Choose a password for your account.', 'اختر كلمة مرور لحسابك.')
                    : tr('Choose a new password. You will be signed out on your other devices.', 'اختر كلمة مرور جديدة. سيتم تسجيل خروجك من أجهزتك الأخرى.')}
                  <span className="mt-1 block" dir="ltr">{link.email}</span>
                </CardDescription>
              </>
            ) : (
              <CardDescription>{tr('Checking the link…', 'جارٍ التحقق من الرابط…')}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {link === 'bad' ? (
              <div className="grid gap-2">
                <Button asChild className="w-full"><Link href="/forgot-password">{tr('Send me a new link', 'أرسل لي رابطاً جديداً')}</Link></Button>
                <Button asChild variant="ghost" className="w-full"><Link href="/login">{tr('Back to sign in', 'العودة لتسجيل الدخول')}</Link></Button>
              </div>
            ) : link ? (
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="password">{tr('New password', 'كلمة المرور الجديدة')}</Label>
                  <div className="relative">
                    <Input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} className="pe-10" aria-describedby="password-help" />
                    <button type="button" onClick={() => setShow((v) => !v)} className="absolute end-2 top-2.5 text-muted-foreground" aria-label={show ? tr('Hide password', 'إخفاء كلمة المرور') : tr('Show password', 'إظهار كلمة المرور')}>
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p id="password-help" className={tooShort ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                    {tr(`At least ${MIN} characters.`, `${MIN} أحرف على الأقل.`)}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm">{tr('Type it again', 'أعد كتابتها')}</Label>
                  <Input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
                  {mismatch && <p className="text-xs text-destructive">{tr('The two passwords are different.', 'كلمتا المرور غير متطابقتين.')}</p>}
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy || password.length < MIN || password !== confirm}>
                  {busy ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save and sign in', 'حفظ وتسجيل الدخول')}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <SetPasswordInner />
    </React.Suspense>
  );
}
