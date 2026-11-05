'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  assistantStatusOnce, deleteAssistantExample, getAssistantSettings, listAssistantExamples, listAssistantLog, saveAssistantSettings,
  type AssistantExample, type AssistantLogRow, type AssistantSettings,
} from '@/services/assistantService';

const ROLE_AR: Record<string, string> = { Admin: 'مدير النظام', Manager: 'مدير', Accountant: 'محاسب', Employee: 'موظف' };
/** The areas as people name them (backend review.ts areaOf); unknown ones fall back to the word itself. */
const AREA_LABELS: Record<string, [string, string]> = {
  approvals: ['Approvals', 'الموافقات'], campaigns: ['Campaigns', 'الحملات'], commissions: ['Commissions', 'العمولات'], contacts: ['Contacts', 'جهات الاتصال'],
  crm: ['CRM & follow-ups', 'إدارة العملاء والمتابعات'], discover: ['Influencer discovery', 'اكتشاف المؤثرين'], documents: ['Documents & files', 'المستندات والملفات'],
  finance: ['Finance & accounting', 'المالية والمحاسبة'], games: ['Games', 'الألعاب'], group: ['Company group', 'مجموعة الشركات'], hr: ['HR & leave', 'الموارد البشرية والإجازات'],
  inbox: ['Inbox', 'صندوق الوارد'], influencers: ['Influencers', 'المؤثرون'], inventory: ['Inventory', 'المخزون'], invoices: ['Invoices & payments', 'الفواتير والمدفوعات'],
  logistics: ['Shipping & logistics', 'الشحن والخدمات اللوجستية'], manufacturing: ['Manufacturing', 'التصنيع'], payroll: ['Payroll', 'الرواتب'], people: ['People & roles', 'الأشخاص والأدوار'],
  personal: ['Own profile & notifications', 'الملف الشخصي والتنبيهات'], portal: ['Client portal', 'بوابة العملاء'], projects: ['Projects', 'المشاريع'],
  purchasing: ['Purchasing', 'المشتريات'], quality: ['Quality', 'الجودة'], sales: ['Sales & quotations', 'المبيعات وعروض الأسعار'], settings: ['Settings', 'الإعدادات'],
  tasks: ['Tasks & time', 'المهام والوقت'], 'vendor-bills': ['Supplier bills', 'فواتير الموردين'], whatsapp: ['WhatsApp', 'واتساب'],
};

const STATUS: Record<string, [string, string]> = {
  pending: ['Waiting', 'بانتظار'], running: ['Running', 'قيد التنفيذ'], done: ['Done', 'تم'], failed: ['Failed', 'فشل'],
  declined: ['Declined', 'مرفوض'], expired: ['Expired', 'انتهت'], undone: ['Undone', 'تم التراجع'],
};

/**
 * Settings → Assistant: how far the assistant may go in this company, every
 * change it proposed or made, and what it learned. Shown only where the server
 * has a model; editable with settings.edit (the log and examples too).
 */
export function AssistantSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const companyId = selectedCompany?.id;
  const [serverHasModel, setServerHasModel] = React.useState(false);
  const [form, setForm] = React.useState<AssistantSettings | null>(null);
  const [areas, setAreas] = React.useState<string[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [log, setLog] = React.useState<AssistantLogRow[] | null>(null);
  const [logStatus, setLogStatus] = React.useState('');
  const [examples, setExamples] = React.useState<AssistantExample[] | null>(null);

  React.useEffect(() => { void assistantStatusOnce().then((s) => setServerHasModel(s.enabled)); }, []);
  React.useEffect(() => {
    if (!companyId || !serverHasModel) return;
    let live = true;
    getAssistantSettings(companyId)
      .then((v) => { if (live) { setForm(v.settings); setAreas(v.areas); setRoles(v.roles); } })
      .catch(() => { if (live) setForm(null); });
    return () => { live = false; };
  }, [companyId, serverHasModel]);
  React.useEffect(() => {
    if (!companyId || !serverHasModel || !canEdit) return;
    let live = true;
    listAssistantLog(companyId, { status: logStatus || undefined, limit: 50 }).then((rows) => { if (live) setLog(rows); }).catch(() => { if (live) setLog([]); });
    return () => { live = false; };
  }, [companyId, serverHasModel, canEdit, logStatus]);
  React.useEffect(() => {
    if (!companyId || !serverHasModel || !canEdit) return;
    let live = true;
    listAssistantExamples(companyId).then((rows) => { if (live) setExamples(rows); }).catch(() => { if (live) setExamples([]); });
    return () => { live = false; };
  }, [companyId, serverHasModel, canEdit]);

  if (!serverHasModel || !form || !companyId) return null;
  const set = (patch: Partial<AssistantSettings>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    if (form.changeAreas && !form.changeAreas.length) { setError(tr('Pick at least one area, or allow every area.', 'اختر مجالًا واحدًا على الأقل، أو اسمح بكل المجالات.')); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveAssistantSettings(companyId, form);
      setForm(saved.settings);
      toast({ title: tr('Assistant settings saved', 'تم حفظ إعدادات المساعد') });
    } catch (e) {
      setError((e as Error)?.message || tr('Could not save. Try again.', 'تعذّر الحفظ. حاول مجددًا.'));
    } finally {
      setSaving(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'ar' ? 'ar-OM' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Assistant', 'المساعد')}</CardTitle>
        <CardDescription>
          {tr('How far the assistant may go in this company. It always acts with the person’s own permissions, and nothing changes until they confirm.',
            'إلى أي حد يعمل المساعد في هذه الشركة. يعمل دائمًا بصلاحيات الشخص نفسه، ولا يتغير شيء قبل تأكيده.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="assistant-enabled" className="flex flex-col gap-0.5">
            <span>{tr('Assistant on', 'المساعد مفعّل')}</span>
            <span className="text-xs font-normal text-muted-foreground">{tr('Off turns it off for everyone in this company.', 'الإيقاف يوقفه للجميع في هذه الشركة.')}</span>
          </Label>
          <Switch id="assistant-enabled" checked={form.enabled} disabled={!canEdit} onCheckedChange={(v) => set({ enabled: v })} />
        </div>

        <fieldset className="flex flex-col gap-2" disabled={!canEdit || !form.enabled}>
          <legend className="text-sm font-medium">{tr('Who may use it', 'من يمكنه استخدامه')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {roles.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.roles.includes(r)} disabled={r === 'Admin' || !canEdit || !form.enabled} onCheckedChange={() => set({ roles: toggle(form.roles, r) })} />
                {language === 'ar' ? ROLE_AR[r] ?? r : r}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{tr('Administrators always may, so nobody locks themselves out.', 'مدير النظام يمكنه دائمًا، حتى لا يُقفل أحد على نفسه.')}</p>
        </fieldset>

        <fieldset className="flex flex-col gap-2" disabled={!canEdit || !form.enabled}>
          <legend className="text-sm font-medium">{tr('What it may change', 'ما يمكنه تغييره')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="assistant-areas" checked={form.changeAreas === null} onChange={() => set({ changeAreas: null })} />
              {tr('Everything the person can change', 'كل ما يستطيع الشخص تغييره')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="assistant-areas" checked={form.changeAreas !== null} onChange={() => set({ changeAreas: ['tasks'] })} />
              {tr('Only these areas', 'هذه المجالات فقط')}
            </label>
          </div>
          {form.changeAreas !== null ? (
            <div className="flex flex-wrap gap-1.5">
              {areas.map((a) => {
                const on = form.changeAreas!.includes(a);
                return (
                  <button key={a} type="button" aria-pressed={on} onClick={() => set({ changeAreas: toggle(form.changeAreas!, a) })}
                    className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted')}>
                    {AREA_LABELS[a] ? tr(...AREA_LABELS[a]) : a.replace(/-/g, ' ')}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{tr('It can still read whatever the person can read, to answer questions.', 'يبقى قادرًا على قراءة ما يستطيع الشخص قراءته، للإجابة عن الأسئلة.')}</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-max">{tr('Most changes at once', 'أقصى عدد تغييرات دفعة واحدة')}</Label>
            <Input id="assistant-max" type="number" min={1} max={25} dir="ltr" className="w-28" value={form.maxChanges} disabled={!canEdit || !form.enabled}
              onChange={(e) => set({ maxChanges: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <Label htmlFor="assistant-learn" className="flex flex-col gap-0.5">
              <span>{tr('Learn from use', 'التعلّم من الاستخدام')}</span>
              <span className="text-xs font-normal text-muted-foreground">{tr('Remembers what worked (confirmed changes, 👍) for each person’s next similar request.', 'يتذكر ما نجح (التغييرات المؤكدة و👍) لطلبات كل شخص المشابهة.')}</span>
            </Label>
            <Switch id="assistant-learn" checked={form.learn} disabled={!canEdit || !form.enabled} onCheckedChange={(v) => set({ learn: v })} />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {canEdit ? <div><Button onClick={save} disabled={saving}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}</Button></div> : null}

        {canEdit ? (
          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{tr('Recent changes by the assistant', 'آخر التغييرات عبر المساعد')}</h3>
              <select aria-label={tr('Status', 'الحالة')} className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={logStatus} onChange={(e) => setLogStatus(e.target.value)}>
                <option value="">{tr('All', 'الكل')}</option>
                {Object.entries(STATUS).map(([k, [en, ar]]) => <option key={k} value={k}>{tr(en, ar)}</option>)}
              </select>
            </div>
            {log === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
              : !log.length ? <p className="text-sm text-muted-foreground">{tr('Nothing yet.', 'لا شيء بعد.')}</p>
              : (
                <ul className="flex flex-col divide-y rounded-md border">
                  {log.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="min-w-0 sm:flex-1">
                        {r.summary}
                        {r.edited?.length ? <span className="block text-xs text-muted-foreground">{tr('Edited before confirming: ', 'عُدّل قبل التأكيد: ')}{r.edited.map((c) => `${c.label} ${c.from} → ${c.to}`).join(', ')}</span> : null}
                      </span>
                      <span className="flex shrink-0 flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
                        <span>{r.userName}</span>
                        <span dir="ltr">{when(r.createdAt)}</span>
                        <span className="font-medium text-foreground">{tr(...(STATUS[r.status] ?? [r.status, r.status]))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ) : null}

        {canEdit && form.learn ? (
          <section className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">{tr('What it learned', 'ما تعلّمه')}</h3>
            {examples === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
              : !examples.length ? <p className="text-sm text-muted-foreground">{tr('Nothing yet. Confirmed changes and 👍 on answers teach it.', 'لا شيء بعد. التغييرات المؤكدة و👍 على الإجابات تعلّمه.')}</p>
              : (
                <ul className="flex flex-col divide-y rounded-md border">
                  {examples.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{e.request}</span>
                      <span className="text-xs text-muted-foreground">{e.kind === 'change' ? tr('change', 'تغيير') : tr('question', 'سؤال')} · {tr(`used ${e.uses}×`, `استُخدم ${e.uses} مرة`)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={tr('Forget this', 'انسَ هذا')}
                        onClick={async () => { await deleteAssistantExample(e.id).catch(() => undefined); setExamples((xs) => (xs ?? []).filter((x) => x.id !== e.id)); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
