'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { useLiveRefresh } from '@/lib/live';
import {
  campaignAction,
  createWhatsappCampaign,
  getWhatsappAudience,
  getWhatsappCampaign,
  getWhatsappCampaigns,
  getWhatsappInstance,
  getWhatsappTemplates,
  renderWhatsappTemplate,
  type WhatsAppCampaign,
  type WhatsAppCampaignVariable,
  type WhatsAppInstance,
  type WhatsAppTemplate,
} from '@/services/whatsappService';
import { ArrowLeft, ArrowRight, Loader2, Megaphone, Pause, Play, Plus, XCircle } from 'lucide-react';

const ROLES = ['Client', 'Lead', 'Supplier', 'Influencer', 'Partner'] as const;

/**
 * WhatsApp campaigns: one approved template to many contacts, sent at a safe
 * pace, with a report of how far each message got.
 */
export function WhatsappCampaignsPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const isAdmin = usePermissions().can('whatsapp.manage');
  const companyId = selectedCompany?.id;
  const [instance, setInstance] = React.useState<WhatsAppInstance | null | undefined>(undefined);
  const [campaigns, setCampaigns] = React.useState<WhatsAppCampaign[]>([]);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<WhatsAppCampaign | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      const [inst, list] = await Promise.all([getWhatsappInstance(companyId), getWhatsappCampaigns(companyId)]);
      setInstance(inst);
      setCampaigns(list);
      if (openId) setDetail(await getWhatsappCampaign(companyId, openId));
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not load campaigns', 'تعذّر تحميل الحملات'), description: error?.message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, openId]);

  React.useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(['whatsapp'], load);
  // While a campaign sends, its numbers move: re-read every few seconds.
  const anyRunning = campaigns.some((c) => c.status === 'running');
  React.useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [anyRunning, load]);

  const act = async (id: string, action: 'start' | 'pause' | 'cancel') => {
    if (!companyId) return;
    if (action === 'cancel' && !window.confirm(tr('Cancel this campaign? Messages not sent yet will not go.', 'إلغاء هذه الحملة؟ الرسائل التي لم تُرسل بعد لن تُرسل.'))) return;
    setBusy(true);
    try {
      await campaignAction(companyId, id, action);
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not do that', 'تعذّر تنفيذ ذلك'), description: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s: WhatsAppCampaign['status']) =>
    ({
      draft: tr('Draft', 'مسودة'),
      running: tr('Sending', 'جارٍ الإرسال'),
      paused: tr('Paused', 'متوقفة مؤقتاً'),
      done: tr('Finished', 'انتهت'),
      cancelled: tr('Cancelled', 'ملغاة'),
    })[s];
  const Back = language === 'ar' ? ArrowRight : ArrowLeft;
  const dateFmt = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

  if (!companyId) return null;
  if (instance === undefined) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const controls = (c: WhatsAppCampaign) =>
    isAdmin && (
      <div className="flex flex-wrap gap-2">
        {(c.status === 'draft' || c.status === 'paused') && (
          <Button size="sm" onClick={() => act(c.id, 'start')} disabled={busy || instance?.provider !== 'cloud'}>
            <Play className="me-2 h-4 w-4" />
            {c.status === 'draft' ? tr('Start sending', 'ابدأ الإرسال') : tr('Resume', 'استئناف')}
          </Button>
        )}
        {c.status === 'running' && (
          <Button size="sm" variant="outline" onClick={() => act(c.id, 'pause')} disabled={busy}>
            <Pause className="me-2 h-4 w-4" />
            {tr('Pause', 'إيقاف مؤقت')}
          </Button>
        )}
        {(c.status === 'draft' || c.status === 'running' || c.status === 'paused') && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(c.id, 'cancel')} disabled={busy}>
            <XCircle className="me-2 h-4 w-4" />
            {tr('Cancel', 'إلغاء')}
          </Button>
        )}
      </div>
    );

  const statTiles = (c: WhatsAppCampaign) => {
    const s = c.stats;
    const tiles: Array<[string, number, string]> = [
      [tr('People', 'الأشخاص'), s.total, ''],
      [tr('Sent', 'أُرسلت'), s.sent, pct(s.sent, s.total)],
      [tr('Delivered', 'وصلت'), s.delivered, pct(s.delivered, s.sent)],
      [tr('Read', 'قُرئت'), s.read, pct(s.read, s.sent)],
      [tr('Replied', 'ردّوا'), s.replied, pct(s.replied, s.sent)],
      [tr('Failed', 'فشلت'), s.failed, ''],
    ];
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tiles.map(([label, n, sub]) => (
          <div key={label} className="rounded-lg border p-2">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{n}</div>
            {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
          </div>
        ))}
      </div>
    );
  };

  if (openId && detail) {
    const deliveryLabel = (r: NonNullable<WhatsAppCampaign['recipients']>[number]) => {
      if (r.status === 'queued') return tr('Waiting', 'بالانتظار');
      if (r.status === 'skipped') return r.error === 'Opted out' ? tr('Opted out', 'مستبعد') : tr('Not sent', 'لم يُرسل');
      if (r.status === 'failed' || r.delivery === 'failed') return tr('Failed', 'فشل');
      if (r.delivery === 'read') return tr('Read', 'قُرئت');
      if (r.delivery === 'delivered') return tr('Delivered', 'وصلت');
      return tr('Sent', 'أُرسلت');
    };
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); setDetail(null); }}>
          <Back className="me-2 h-4 w-4" />
          {tr('All campaigns', 'كل الحملات')}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{detail.name}</h1>
            <p className="text-sm text-muted-foreground">
              {statusLabel(detail.status)} · {detail.templateName} ({detail.templateLanguage}) · {detail.createdByName}
            </p>
          </div>
          {controls(detail)}
        </div>
        {statTiles(detail)}
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{tr('Name', 'الاسم')}</th>
                <th className="px-3 py-2 text-start font-medium">{tr('Number', 'الرقم')}</th>
                <th className="px-3 py-2 text-start font-medium">{tr('Status', 'الحالة')}</th>
                <th className="px-3 py-2 text-start font-medium">{tr('Replied', 'ردّ')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(detail.recipients || []).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-1.5">{r.name || '—'}</td>
                  <td className="px-3 py-1.5" dir="ltr">+{r.phone}</td>
                  <td className="px-3 py-1.5">
                    {deliveryLabel(r)}
                    {r.error && r.status === 'failed' && <div className="text-[11px] text-destructive">{r.error}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.replied ? (
                      <a className="text-primary hover:underline" href={`/whatsapp?chat=${encodeURIComponent(`${r.phone}@c.us`)}`}>
                        {tr('Open chat', 'فتح المحادثة')}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Megaphone className="h-5 w-5" />
            {tr('WhatsApp campaigns', 'حملات واتساب')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr('One approved template to many contacts, sent at a safe pace.', 'قالب معتمد واحد لعدد من العملاء، يُرسل بوتيرة آمنة.')}
          </p>
        </div>
        {isAdmin && instance?.provider === 'cloud' && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="me-2 h-4 w-4" />
            {tr('New campaign', 'حملة جديدة')}
          </Button>
        )}
      </div>

      {instance?.provider !== 'cloud' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {tr(
            'Campaigns need the official Meta connection (Settings → WhatsApp). Sending many messages from a QR-linked number gets it banned.',
            'الحملات تحتاج ربط ميتا الرسمي (الإعدادات ← واتساب). إرسال رسائل كثيرة من رقم مربوط برمز QR يعرّضه للحظر.',
          )}
        </div>
      )}

      {campaigns.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{tr('No campaigns yet.', 'لا توجد حملات بعد.')}</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="text-start" onClick={() => setOpenId(c.id)}>
                  <div className="font-semibold hover:underline">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {statusLabel(c.status)} · {dateFmt.format(new Date(c.createdAt))} · {c.createdByName}
                  </div>
                </button>
                {controls(c)}
              </div>
              {c.status === 'running' && c.stats.total > 0 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={c.stats.total - c.stats.queued} aria-valuemax={c.stats.total}>
                  <div className="h-full bg-primary transition-all" style={{ width: `${((c.stats.total - c.stats.queued) / c.stats.total) * 100}%` }} />
                </div>
              )}
              {statTiles(c)}
            </div>
          ))}
        </div>
      )}

      {creating && companyId && (
        <NewCampaignDialog
          companyId={companyId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function NewCampaignDialog({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [templates, setTemplates] = React.useState<WhatsAppTemplate[] | null>(null);
  const [name, setName] = React.useState('');
  const [templateKey, setTemplateKey] = React.useState('');
  const [variables, setVariables] = React.useState<WhatsAppCampaignVariable[]>([]);
  const [role, setRole] = React.useState('Client');
  const [tag, setTag] = React.useState('');
  const [audience, setAudience] = React.useState<Array<{ name: string; optedOut: boolean }> | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getWhatsappTemplates(companyId)
      .then((list) => {
        setTemplates(list);
        if (list[0]) setTemplateKey(`${list[0].name}|${list[0].language}`);
      })
      .catch(() => setTemplates([]));
  }, [companyId]);

  const template = templates?.find((t) => `${t.name}|${t.language}` === templateKey);
  React.useEffect(() => {
    setVariables(Array.from({ length: template?.variableCount ?? 0 }, (_, i) => (i === 0 ? { source: 'name' } : { source: 'text', value: '' })));
  }, [template?.name, template?.language, template?.variableCount]);

  React.useEffect(() => {
    let alive = true;
    setAudience(null);
    const t = window.setTimeout(() => {
      getWhatsappAudience(companyId, { role: role || undefined, tag: tag.trim() || undefined })
        .then((list) => alive && setAudience(list))
        .catch(() => alive && setAudience([]));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [companyId, role, tag]);

  const reachable = audience?.filter((a) => !a.optedOut).length ?? 0;
  const sample = audience?.find((a) => !a.optedOut)?.name || tr('Customer', 'العميل');
  const preview = template
    ? [template.headerText, renderWhatsappTemplate(template.bodyText, variables.map((v) => (v.source === 'name' ? sample : v.value))), template.footerText].filter(Boolean).join('\n\n')
    : '';
  const ready = name.trim() && template && reachable > 0 && variables.every((v) => v.source === 'name' || v.value.trim());

  const create = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const made = await createWhatsappCampaign(companyId, {
        name: name.trim(),
        templateName: template.name,
        templateLanguage: template.language,
        variables,
        audience: { role: role || undefined, tag: tag.trim() || undefined },
      });
      toast({
        title: tr('Campaign saved as a draft', 'حُفظت الحملة كمسودة'),
        description: tr(`${made.stats.total} people. Review, then press Start sending.`, `${made.stats.total} شخصاً. راجعها ثم اضغط «ابدأ الإرسال».`),
      });
      onCreated(made.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not create', 'تعذّر الإنشاء'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr('New campaign', 'حملة جديدة')}</DialogTitle>
          <DialogDescription>{tr('Saved as a draft; nothing is sent until you press Start.', 'تُحفظ كمسودة، ولا يُرسل شيء حتى تضغط «ابدأ».')}</DialogDescription>
        </DialogHeader>
        {!templates ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr('No approved templates yet. Create one in WhatsApp Manager on Meta.', 'لا توجد قوالب معتمدة بعد. أنشئ قالباً من مدير واتساب في ميتا.')}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="camp-name">{tr('Campaign name', 'اسم الحملة')}</Label>
              <Input id="camp-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={tr('November offer', 'عرض نوفمبر')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-template">{tr('Template', 'القالب')}</Label>
              <select id="camp-template" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                {templates.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
            {variables.map((v, i) => (
              <div key={i} className="space-y-1">
                <Label>{tr('Value', 'القيمة')} {`{{${i + 1}}}`}</Label>
                <div className="flex gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-2 text-sm"
                    value={v.source}
                    onChange={(e) => setVariables((prev) => prev.map((x, j) => (j === i ? (e.target.value === 'name' ? { source: 'name' } : { source: 'text', value: '' }) : x)))}
                    aria-label={tr('Where the value comes from', 'مصدر القيمة')}
                  >
                    <option value="name">{tr("Contact's name", 'اسم العميل')}</option>
                    <option value="text">{tr('Fixed text', 'نص ثابت')}</option>
                  </select>
                  {v.source === 'text' && (
                    <Input value={v.value} onChange={(e) => setVariables((prev) => prev.map((x, j) => (j === i ? { source: 'text', value: e.target.value } : x)))} />
                  )}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="camp-role">{tr('Who', 'لمن')}</Label>
                <select id="camp-role" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">{tr('All contacts', 'كل جهات الاتصال')}</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {({ Client: tr('Clients', 'العملاء'), Lead: tr('Leads', 'العملاء المحتملون'), Supplier: tr('Suppliers', 'الموردون'), Influencer: tr('Influencers', 'المؤثرون'), Partner: tr('Partners', 'الشركاء') } as Record<string, string>)[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="camp-tag">{tr('With tag (optional)', 'بوسم (اختياري)')}</Label>
                <Input id="camp-tag" value={tag} onChange={(e) => setTag(e.target.value)} />
              </div>
            </div>
            <p className="text-sm">
              {audience === null ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span className="font-semibold">{reachable}</span> {tr('people with a phone', 'شخصاً لديهم رقم')}
                  {audience.length > reachable && <span className="text-muted-foreground"> · {audience.length - reachable} {tr('opted out', 'مستبعدون')}</span>}
                </>
              )}
            </p>
            {template && (
              <div className="rounded-lg bg-[#d9fdd3] p-3 text-sm whitespace-pre-wrap text-slate-900 dark:bg-[#005c4b] dark:text-[#e9edef]">{preview}</div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={create} disabled={!ready || saving}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {tr('Save as draft', 'حفظ كمسودة')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
