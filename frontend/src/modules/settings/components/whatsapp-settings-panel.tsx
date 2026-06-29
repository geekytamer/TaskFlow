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
import { useToast } from '@/hooks/use-toast';
import type { WhatsAppInstance, WhatsAppInstanceState } from '@/services/whatsappService';
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
import { Loader2, MessageSquare, QrCode, RefreshCw, Trash2 } from 'lucide-react';

const stateBadgeStyles: Record<WhatsAppInstanceState, string> = {
  authorized: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  notAuthorized: 'bg-amber-100 text-amber-700 border-amber-200',
  starting: 'bg-blue-100 text-blue-700 border-blue-200',
  sleepMode: 'bg-slate-100 text-slate-700 border-slate-200',
  blocked: 'bg-red-100 text-red-700 border-red-200',
  yellowCard: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  unknown: 'bg-muted text-muted-foreground border',
};

export function WhatsappSettingsPanel() {
  const { selectedCompany } = useCompany();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [instance, setInstance] = React.useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [qr, setQr] = React.useState<string | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [showQrPoller, setShowQrPoller] = React.useState(false);
  const [form, setForm] = React.useState({
    idInstance: '',
    apiToken: '',
    apiHost: '',
    phoneNumber: '',
    displayName: '',
  });
  const [testPhone, setTestPhone] = React.useState('');
  const [testMessage, setTestMessage] = React.useState(
    language === 'ar' ? 'مرحباً من TaskFlow 👋' : 'Hello from TaskFlow 👋',
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
        setForm((prev) => ({
          ...prev,
          idInstance: data.idInstance,
          phoneNumber: data.phoneNumber || '',
          displayName: data.displayName || '',
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
    if (!form.idInstance.trim() || !form.apiToken.trim()) {
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
        idInstance: form.idInstance.trim(),
        apiToken: form.apiToken.trim(),
        apiHost: form.apiHost.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        displayName: form.displayName.trim() || undefined,
      });
      setInstance(saved);
      setForm((prev) => ({ ...prev, apiToken: '' }));
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
      setForm({ idInstance: '', apiToken: '', apiHost: '', phoneNumber: '', displayName: '' });
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
        {/* Credentials form */}
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
                {t('whatsapp.configureWebhook')}
              </Button>
              {isAuthorized ? (
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

        {/* QR */}
        {showQrPoller && !isAuthorized && instance && (
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
