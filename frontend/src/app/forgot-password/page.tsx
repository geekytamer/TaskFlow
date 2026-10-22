'use client';

import * as React from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/i18n-context';
import { BrandMark } from '@/modules/branding/brand-mark';
import { StagingBanner } from '@/modules/layout/components/staging-banner';
import { requestPasswordReset } from '@/services/authService';

/** Asks for a reset link. The answer is the same whether or not the address has an account. */
export default function ForgotPasswordPage() {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Something went wrong. Try again.', 'حدث خطأ. حاول مرة أخرى.'));
    } finally {
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
            <CardTitle className="text-2xl">{tr('Forgot your password?', 'نسيت كلمة المرور؟')}</CardTitle>
            {!done && (
              <CardDescription>
                {tr('Enter your work email and we will send you a link to set a new one.', 'اكتب بريد العمل وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.')}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="space-y-4 text-center">
                <MailCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
                <p className="text-sm">
                  {tr(
                    'If that address has an account, an email with a reset link is on its way. The link works for 1 hour. Check your spam folder too.',
                    'إذا كان هذا البريد مسجلاً لدينا فسيصلك بريد فيه رابط إعادة التعيين. الرابط صالح لمدة ساعة. تحقق من مجلد الرسائل غير المرغوبة أيضاً.',
                  )}
                </p>
                <Button asChild variant="outline" className="w-full"><Link href="/login">{tr('Back to sign in', 'العودة لتسجيل الدخول')}</Link></Button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">{tr('Email', 'البريد الإلكتروني')}</Label>
                  <Input id="email" type="email" required dir="ltr" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? tr('Sending…', 'جارٍ الإرسال…') : tr('Send the link', 'أرسل الرابط')}
                </Button>
                <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">{tr('Back to sign in', 'العودة لتسجيل الدخول')}</Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
