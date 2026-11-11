'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useBrand } from '@/modules/branding/brand-context';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api-client';
import type { WhatsAppInstance, WhatsAppInstanceState, WhatsAppProvider } from '@/services/whatsappService';
import {
  configureWhatsappWebhook,
  deleteWhatsappInstance,
  getWhatsappInstance,
  getWhatsappQr,
  getWhatsappState,
  logoutWhatsapp,
  saveWhatsappInstance,
  sendWhatsappMessage,
} from '@/services/whatsappService';
import { BadgeCheck, Copy, Loader2, MessageSquare, QrCode, RefreshCw, Trash2 } from 'lucide-react';

const stateBadgeStyles: Record<WhatsAppInstanceState, string> = {
  authorized: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  notAuthorized: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  starting: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  sleepMode: 'bg-muted text-foreground/80 border-border',
  blocked: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  yellowCard: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-500/30',
  unknown: 'bg-muted text-muted-foreground border',
};

export function WhatsappSettingsPanel() {
  const { selectedCompany } = useCompany();
  const { t, language } = useI18n();
  const { name: brand } = useBrand();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [instance, setInstance] = React.useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [qr, setQr] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [showQrPoller, setShowQrPoller] = React.useState(false);
  const [provider, setProvider] = React.useState<WhatsAppProvider>('green');
  const [form, setForm] = React.useState({
    idInstance: '',
    apiToken: '',
    apiHost: '',
    phoneNumber: '',
    displayName: '',
    wabaId: '',
    appSecret: '',
  });
  const [cloudHook, setCloudHook] = React.useState<{ webhookUrl: string; verifyToken: string } | null>(null);
  const [testPhone, setTestPhone] = React.useState('');
  const [testMessage, setTestMessage] = React.useState(
    language === 'ar' ? `مرحباً من ${brand} 👋` : `Hello from ${brand} 👋`,
  );
  const [testSending, setTestSending] = React.useState(false);

  const companyId = selectedCompany?.id;

  const load = React.useCallback(async () => {
    if (!companyId) {
      setInstance(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getWhatsappInstance(companyId);
      setInstance(data);
      if (data) {
        setProvider(data.provider || 'green');
        setForm((prev) => ({
          ...prev,
          idInstance: data.idInstance,
          phoneNumber: data.phoneNumber || '',
          displayName: data.displayName || '',
          wabaId: data.wabaId || '',
        }));
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.loadFailedTitle'),
        description: error?.message || t('whatsapp.loadFailedDescription'),
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!companyId) return;
    // A stored token (or app secret) may stay as it is when the provider is unchanged.
    const sameProvider = instance?.provider === provider;
    const missing =
      !form.idInstance.trim() ||
      (!form.apiToken.trim() && !sameProvider) ||
      (provider === 'cloud' && (!form.wabaId.trim() || (!form.appSecret.trim() && !(sameProvider && instance?.hasAppSecret))));
    if (missing) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.missingCredsTitle'),
        description: t('whatsapp.missingCredsDescription'),
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveWhatsappInstance(companyId, {
        provider,
        idInstance: form.idInstance.trim(),
        apiToken: form.apiToken.trim() || undefined,
        apiHost: provider === 'green' ? form.apiHost.trim() || undefined : undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        displayName: form.displayName.trim() || undefined,
        wabaId: provider === 'cloud' ? form.wabaId.trim() : undefined,
        appSecret: provider === 'cloud' ? form.appSecret.trim() || undefined : undefined,
      });
      setInstance(saved);
      setForm((prev) => ({ ...prev, apiToken: '', appSecret: '' }));
      if (saved.provider === 'cloud') {
        // Meta needs the webhook pasted in its dashboard: show it right away.
        configureWhatsappWebhook(companyId)
          .then((res) => res.verifyToken && setCloudHook({ webhookUrl: res.webhookUrl, verifyToken: res.verifyToken }))
          .catch(() => undefined);
      }
      toast({ title: t('whatsapp.savedToast') });
      // Auto-refresh state immediately
      try {
        const refreshed = await getWhatsappState(companyId);
        setInstance(refreshed);
      } catch {
        /* state probe failure is non-fatal here */
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.saveFailedTitle'),
        description: error?.message || t('whatsapp.saveFailedDescription'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshState = async () => {
    if (!companyId) return;
    setRefreshing(true);
    try {
      const refreshed = await getWhatsappState(companyId);
      setInstance(refreshed);
      toast({ title: t('whatsapp.stateRefreshedToast'), description: refreshed.state });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.refreshFailedTitle'),
        description: error?.message || t('whatsapp.refreshFailedDescription'),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleFetchQr = React.useCallback(async () => {
    if (!companyId) return;
    setQrLoading(true);
    try {
      const res = await getWhatsappQr(companyId);
      if (res.type === 'qrCode' && res.message) {
        setQr(res.message);
      } else {
        setQr(null);
        toast({
          title: t('whatsapp.qrUnavailableTitle'),
          description: res.message || t('whatsapp.qrUnavailableDescription'),
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.qrFailedTitle'),
        description: error?.message || t('whatsapp.qrFailedDescription'),
      });
    } finally {
      setQrLoading(false);
    }
  }, [companyId, toast, t]);

  // Poll QR every 8s while user has the QR panel open and we're not authorized
  React.useEffect(() => {
    if (!showQrPoller || !companyId) return;
    if (instance?.state === 'authorized') return;
    const id = window.setInterval(async () => {
      try {
        const res = await getWhatsappQr(companyId);
        if (res.type === 'qrCode' && res.message) setQr(res.message);
        const state = await getWhatsappState(companyId);
        setInstance(state);
        if (state.state === 'authorized') {
          setShowQrPoller(false);
          setQr(null);
          toast({ title: t('whatsapp.linkedToast') });
        }
      } catch {
        /* swallow polling errors */
      }
    }, 8000);
    return () => window.clearInterval(id);
  }, [showQrPoller, companyId, instance?.state, t, toast]);

  const handleStartLink = async () => {
    setShowQrPoller(true);
    await handleFetchQr();
  };

  const handleConfigureWebhook = async () => {
    if (!companyId) return;
    try {
      const res = await configureWhatsappWebhook(companyId);
      if (res.manual && res.verifyToken) {
        setCloudHook({ webhookUrl: res.webhookUrl, verifyToken: res.verifyToken });
        return;
      }
      toast({
        title: t('whatsapp.webhookConfiguredTitle'),
        description: res.webhookUrl,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.webhookFailedTitle'),
        description: error?.message || t('whatsapp.webhookFailedDescription'),
      });
    }
  };

  const handleLogout = async () => {
    if (!companyId) return;
    try {
      await logoutWhatsapp(companyId);
      await load();
      toast({ title: t('whatsapp.loggedOutToast') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.logoutFailedTitle'),
        description: error?.message || t('whatsapp.logoutFailedDescription'),
      });
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;
    if (!window.confirm(t('whatsapp.deleteConfirm'))) return;
    try {
      await deleteWhatsappInstance(companyId);
      setInstance(null);
      setForm({ idInstance: '', apiToken: '', apiHost: '', phoneNumber: '', displayName: '', wabaId: '', appSecret: '' });
      setCloudHook(null);
      setQr(null);
      setShowQrPoller(false);
      toast({ title: t('whatsapp.deletedToast') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.deleteFailedTitle'),
        description: error?.message || t('whatsapp.deleteFailedDescription'),
      });
    }
  };

  const handleTestSend = async () => {
    if (!companyId) return;
    if (!testPhone.trim() || !testMessage.trim()) return;
    setTestSending(true);
    try {
      await sendWhatsappMessage(companyId, {
        phone: testPhone.trim(),
        message: testMessage.trim(),
      });
      toast({ title: t('whatsapp.testSentToast') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('whatsapp.testFailedTitle'),
        description: error?.message || t('whatsapp.testFailedDescription'),
      });
    } finally {
      setTestSending(false);
    }
  };

  if (!companyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {t('whatsapp.title')}
          </CardTitle>
          <CardDescription>{t('whatsapp.selectCompany')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isAuthorized = instance?.state === 'authorized';
  const savedCloud = instance?.provider === 'cloud';
  // Meta must reach the API from the internet: build the address from the one
  // this page itself uses (it carries the /api prefix nginx needs), not from
  // what the server sees behind the proxy.
  const callbackUrl = (hook: { webhookUrl: string; verifyToken: string }) =>
    /^https?:\/\//.test(API_BASE_URL)
      ? `${API_BASE_URL.replace(/\/$/, '')}/whatsapp/cloud-webhook/${hook.verifyToken}`
      : hook.webhookUrl;
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast({ title: tr('Copied', 'تم النسخ') }),
      () => undefined,
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t('whatsapp.title')}
            </CardTitle>
            <CardDescription>{t('whatsapp.subtitle')}</CardDescription>
          </div>
          {instance && (
            <Badge variant="outline" className={stateBadgeStyles[instance.state]}>
              {t(`whatsapp.state.${instance.state}` as any) || instance.state}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Which way the number is connected */}
        <div className="space-y-2">
          <Label>{tr('Connection type', 'طريقة الربط')}</Label>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {([
              ['green', tr('Linked by QR code', 'ربط برمز QR'), tr('Your normal WhatsApp number, linked like WhatsApp Web (Green API).', 'رقمك العادي، يُربط مثل واتساب ويب (خدمة جرين).')],
              ['cloud', tr('Official Meta API', 'واجهة ميتا الرسمية'), tr('WhatsApp Business Platform: approved templates, lower ban risk, per-conversation fees.', 'منصة واتساب للأعمال: قوالب معتمدة، وخطر حظر أقل، ورسوم على كل محادثة.')],
            ] as const).map(([value, title, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={provider === value}
                onClick={() => {
                  setProvider(value);
                  // Each connection type has its own id: do not carry one into the other.
                  setForm((p) => ({ ...p, idInstance: value === instance?.provider ? instance.idInstance : '', apiToken: '', appSecret: '' }));
                }}
                className={`rounded-lg border p-3 text-start transition-colors ${provider === value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {value === 'cloud' ? <BadgeCheck className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                  {title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          {instance && instance.provider !== provider && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {tr(
                'Saving switches this company to the new connection. Past messages stay in the inbox.',
                'عند الحفظ تنتقل الشركة إلى طريقة الربط الجديدة. الرسائل السابقة تبقى في صندوق المحادثات.',
              )}
            </p>
          )}
        </div>

        {provider === 'cloud' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="wa-phone-id">{tr('Phone Number ID', 'معرّف رقم الهاتف (Phone Number ID)')}</Label>
              <Input
                id="wa-phone-id"
                dir="ltr"
                value={form.idInstance}
                onChange={(e) => setForm((p) => ({ ...p, idInstance: e.target.value }))}
                placeholder="123456789012345"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-waba">{tr('WhatsApp Business Account ID', 'معرّف حساب واتساب للأعمال (WABA ID)')}</Label>
              <Input
                id="wa-waba"
                dir="ltr"
                value={form.wabaId}
                onChange={(e) => setForm((p) => ({ ...p, wabaId: e.target.value }))}
                placeholder="998877665544"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-token">{tr('Permanent access token', 'رمز الوصول الدائم')}</Label>
              <Input
                id="wa-token"
                type="password"
                dir="ltr"
                value={form.apiToken}
                onChange={(e) => setForm((p) => ({ ...p, apiToken: e.target.value }))}
                placeholder={savedCloud ? t('whatsapp.tokenStored') : 'EAAG…'}
              />
              <p className="text-xs text-muted-foreground">
                {tr('From a System User in Meta Business Settings, with whatsapp_business_messaging and whatsapp_business_management.', 'من «مستخدم النظام» في إعدادات أعمال ميتا، مع صلاحيتي الرسائل وإدارة واتساب للأعمال.')}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wa-secret">{tr('App secret', 'المفتاح السري للتطبيق')}</Label>
              <Input
                id="wa-secret"
                type="password"
                dir="ltr"
                value={form.appSecret}
                onChange={(e) => setForm((p) => ({ ...p, appSecret: e.target.value }))}
                placeholder={savedCloud && instance?.hasAppSecret ? t('whatsapp.tokenStored') : ''}
              />
              <p className="text-xs text-muted-foreground">
                {tr('App settings → Basic. Used to check that incoming messages really come from Meta.', 'إعدادات التطبيق ← أساسي. نستخدمه للتأكد أن الرسائل الواردة من ميتا فعلاً.')}
              </p>
            </div>
          </div>
        ) : (
          <>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t('whatsapp.idInstance')}</Label>
            <Input
              value={form.idInstance}
              onChange={(e) => setForm((p) => ({ ...p, idInstance: e.target.value }))}
              placeholder="1101234567"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('whatsapp.apiToken')}</Label>
            <Input
              type="password"
              value={form.apiToken}
              onChange={(e) => setForm((p) => ({ ...p, apiToken: e.target.value }))}
              placeholder={instance ? t('whatsapp.tokenStored') : t('whatsapp.tokenPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('whatsapp.tokenHelp')}</p>
          </div>
          <div className="space-y-1">
            <Label>{t('whatsapp.apiHost')}</Label>
            <Input
              value={form.apiHost}
              onChange={(e) => setForm((p) => ({ ...p, apiHost: e.target.value }))}
              placeholder="https://api.green-api.com"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('whatsapp.phoneNumber')}</Label>
            <Input
              value={form.phoneNumber}
              onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
              placeholder="+971501234567"
            />
          </div>
        </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {instance ? t('whatsapp.update') : t('whatsapp.connect')}
          </Button>
          {instance && (
            <>
              <Button variant="outline" onClick={handleRefreshState} disabled={refreshing}>
                <RefreshCw className={`me-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {t('whatsapp.refreshState')}
              </Button>
              <Button variant="outline" onClick={handleConfigureWebhook}>
                {savedCloud ? tr('Show webhook details', 'عرض بيانات الربط مع ميتا') : t('whatsapp.configureWebhook')}
              </Button>
              {savedCloud ? null : isAuthorized ? (
                <Button variant="outline" onClick={handleLogout}>
                  {t('whatsapp.logout')}
                </Button>
              ) : (
                <Button variant="outline" onClick={handleStartLink}>
                  <QrCode className="me-2 h-4 w-4" />
                  {t('whatsapp.linkDevice')}
                </Button>
              )}
              <Button variant="ghost" className="text-destructive" onClick={handleDelete}>
                <Trash2 className="me-2 h-4 w-4" />
                {t('whatsapp.disconnect')}
              </Button>
            </>
          )}
        </div>

        {/* Cloud API: what to paste in Meta's dashboard */}
        {savedCloud && cloudHook && (
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="text-sm font-semibold">{tr('Webhook for Meta', 'الربط مع ميتا (Webhook)')}</h4>
            <p className="text-xs text-muted-foreground">
              {tr(
                'In your Meta app: WhatsApp → Configuration → Webhook → Edit. Paste these two values, verify, then subscribe to the "messages" field.',
                'في تطبيقك على ميتا: واتساب ← الإعداد ← Webhook ← تعديل. الصق القيمتين ثم اضغط تحقّق، وبعدها اشترك في حقل «messages».',
              )}
            </p>
            {([
              [tr('Callback URL', 'رابط الاستدعاء (Callback URL)'), callbackUrl(cloudHook)],
              [tr('Verify token', 'رمز التحقق (Verify token)'), cloudHook.verifyToken],
            ] as const).map(([label, value]) => (
              <div key={label} className="space-y-1">
                <Label>{label}</Label>
                <div className="flex gap-2">
                  <Input readOnly dir="ltr" value={value} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(value)} title={tr('Copy', 'نسخ')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* QR */}
        {!savedCloud && showQrPoller && !isAuthorized && instance && (
          <div className="rounded-lg border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t('whatsapp.qrHeading')}</h4>
              <Button variant="ghost" size="sm" onClick={handleFetchQr} disabled={qrLoading}>
                {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('whatsapp.qrRefresh')}
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('whatsapp.qrInstructions')}
            </p>
            <div className="flex items-center justify-center">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${qr}`}
                  alt={tr('WhatsApp QR', 'رمز QR للواتساب')}
                  className="h-56 w-56"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded border bg-muted/30 text-sm text-muted-foreground">
                  {qrLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : t('whatsapp.qrPending')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Test send */}
        {isAuthorized && (
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold">{t('whatsapp.testSendHeading')}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('whatsapp.recipient')}</Label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+971501234567"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('whatsapp.message')}</Label>
              <Textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
            </div>
            <Button onClick={handleTestSend} disabled={testSending || !testPhone || !testMessage}>
              {testSending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('whatsapp.sendTest')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
