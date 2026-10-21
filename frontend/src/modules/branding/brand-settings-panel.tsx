'use client';

import * as React from 'react';
import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CompanyMark } from '@/modules/companies/components/company-mark';
import { updateCompany } from '@/services/companyService';
import {
  BRAND_FONTS,
  BRAND_SWATCHES,
  hexToHsl,
  type BrandFont,
  type BrandMode,
  type BrandRadius,
  type CompanyBranding,
} from './brand';
import { useBrand } from './brand-context';

const SIDEBAR_SWATCHES = ['#111111', '#0f172a', '#1e1b4b', '#ffffff', '#f5f5f4'];
const EMPTY: CompanyBranding = { enabled: false };

function ColourField({
  label,
  hint,
  value,
  swatches,
  onChange,
  clearLabel,
}: {
  label: string;
  hint?: string;
  value?: string;
  swatches: string[];
  onChange: (value?: string) => void;
  clearLabel: string;
}) {
  const [text, setText] = React.useState(value ?? '');
  React.useEffect(() => setText(value ?? ''), [value]);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            aria-pressed={value === c}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition hover:scale-110',
              value === c && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
            style={{ background: c }}
          >
            {value === c && <Check className={cn('h-4 w-4', (hexToHsl(c)?.l ?? 0) > 60 ? 'text-black' : 'text-white')} />}
          </button>
        ))}
        <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] shadow-sm" title={label}>
          <input
            type="color"
            value={value ?? '#94701a'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          placeholder="#f26a1b"
          className="h-8 w-28 font-mono text-xs"
          dir="ltr"
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onChange(undefined)}>
            {clearLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Company admins give the app their own name, logo, colours, font and default mode. */
export function BrandSettingsPanel() {
  const { selectedCompany, setSelectedCompany, refreshCompanies } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { setPreview } = useBrand();
  const { toast } = useToast();
  const confirm = useConfirm();

  const saved = selectedCompany?.branding ?? EMPTY;
  const [form, setForm] = React.useState<CompanyBranding>(saved);
  const [logoUrl, setLogoUrl] = React.useState<string | undefined>(selectedCompany?.logoUrl);
  const [saving, setSaving] = React.useState(false);

  // A different company, or a fresh save: start from what is stored.
  React.useEffect(() => {
    setForm(selectedCompany?.branding ?? EMPTY);
    setLogoUrl(selectedCompany?.logoUrl);
  }, [selectedCompany]);

  const dirty =
    JSON.stringify(form) !== JSON.stringify(saved) || (logoUrl ?? '') !== (selectedCompany?.logoUrl ?? '');

  // While editing, the whole app shows the brand as it would look.
  React.useEffect(() => {
    setPreview(dirty ? { branding: form, logoUrl } : undefined);
  }, [dirty, form, logoUrl, setPreview]);
  React.useEffect(() => () => setPreview(undefined), [setPreview]);

  if (!selectedCompany) return null;
  const set = (patch: Partial<CompanyBranding>) => setForm((f) => ({ ...f, ...patch }));

  const persist = async (branding: CompanyBranding | null, logo: string | undefined) => {
    setSaving(true);
    try {
      const updated = await updateCompany(selectedCompany.id, {
        branding: branding as CompanyBranding,
        ...((logo ?? '') !== (selectedCompany.logoUrl ?? '') ? { logoUrl: logo ?? '' } : {}),
      });
      setPreview(undefined);
      setSelectedCompany(updated);
      refreshCompanies();
      toast(
        branding
          ? { title: tr('Brand saved', 'تم حفظ الهوية'), description: tr('Everyone in the company sees it now.', 'يراها جميع موظفي الشركة الآن.') }
          : { title: tr('Standard look restored', 'رجع الشكل الافتراضي'), description: tr('Everyone in the company sees Al Yarubi Group again.', 'يرى جميع موظفي الشركة مجموعة اليعربي من جديد.') },
      );
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: tr('Could not save the brand', 'تعذّر حفظ الهوية'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    const ok = await confirm({
      title: tr('Back to the standard look?', 'الرجوع إلى الشكل الافتراضي؟'),
      description: tr(
        'Your colours, font and name are removed for everyone in the company. The company logo stays.',
        'ستُزال الألوان والخط والاسم لجميع موظفي الشركة. يبقى شعار الشركة كما هو.',
      ),
      confirmText: tr('Reset', 'إعادة التعيين'),
      cancelText: tr('Cancel', 'إلغاء'),
    });
    if (ok) await persist(null, selectedCompany.logoUrl);
  };

  const fontLabel = (f: BrandFont) =>
    f === 'default' ? tr('Standard (PT Sans)', 'الافتراضي (PT Sans)') : BRAND_FONTS[f].label;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          {tr('Company brand', 'هوية الشركة')}
        </CardTitle>
        <CardDescription>
          {tr(
            'Your name, logo and colours across the app for everyone in this company. Changes show live here and only take effect for others when you save.',
            'اسمكم وشعاركم وألوانكم في كل التطبيق لجميع موظفي الشركة. التعديلات تظهر لك مباشرة للمعاينة، ولا تصل للآخرين إلا بعد الحفظ.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="brand-enabled" className="text-base">{tr('Use our brand', 'استخدم هويتنا')}</Label>
            <p className="text-sm text-muted-foreground">
              {tr('Shows your name and logo instead of Al Yarubi Group, with your colours and font.', 'يظهر اسمكم وشعاركم بدل مجموعة اليعربي، مع ألوانكم وخطكم.')}
            </p>
          </div>
          <Switch id="brand-enabled" checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
        </div>

        <fieldset disabled={!form.enabled} className={cn('space-y-6', !form.enabled && 'pointer-events-none opacity-50')}>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brand-name">{tr('Name shown in the app', 'الاسم الظاهر في التطبيق')}</Label>
              <Input
                id="brand-name"
                value={form.displayName ?? ''}
                maxLength={40}
                placeholder={selectedCompany.name}
                onChange={(e) => set({ displayName: e.target.value || undefined })}
              />
              <p className="text-xs text-muted-foreground">{tr('Leave empty to use the company name.', 'اتركه فارغاً لاستخدام اسم الشركة.')}</p>
            </div>
            <div className="space-y-2">
              <Label>{tr('Logo', 'الشعار')}</Label>
              <div className="flex items-center gap-3">
                <CompanyMark company={{ name: selectedCompany.name, logoUrl }} className="h-12 w-12" />
                <ImageUpload value={logoUrl} onChange={setLogoUrl} label={tr('Upload logo', 'رفع الشعار')} />
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <ColourField
              label={tr('Main colour', 'اللون الأساسي')}
              hint={tr('Buttons, links and highlights.', 'الأزرار والروابط والعناصر المميزة.')}
              value={form.primaryColor}
              swatches={BRAND_SWATCHES}
              onChange={(primaryColor) => set({ primaryColor })}
              clearLabel={tr('Standard', 'الافتراضي')}
            />
            <ColourField
              label={tr('Sidebar colour', 'لون القائمة الجانبية')}
              hint={tr('A light colour here keeps the standard sidebar in dark mode.', 'اللون الفاتح هنا يُستبدل بالقائمة الافتراضية في الوضع الليلي.')}
              value={form.sidebarColor}
              swatches={SIDEBAR_SWATCHES}
              onChange={(sidebarColor) => set({ sidebarColor })}
              clearLabel={tr('Standard', 'الافتراضي')}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{tr('Font', 'الخط')}</Label>
              <Select value={form.font ?? 'default'} onValueChange={(v) => set({ font: v === 'default' ? undefined : (v as BrandFont) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BRAND_FONTS) as BrandFont[]).map((f) => (
                    <SelectItem key={f} value={f}>{fontLabel(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{tr('Corners', 'الحواف')}</Label>
              <div>
                <Segmented<BrandRadius>
                  value={form.radius ?? 'round'}
                  onChange={(radius) => set({ radius: radius === 'round' ? undefined : radius })}
                  options={[
                    { value: 'sharp', label: tr('Sharp', 'حادة') },
                    { value: 'soft', label: tr('Soft', 'ناعمة') },
                    { value: 'round', label: tr('Round', 'دائرية') },
                  ]}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tr('Default look', 'الوضع الافتراضي')}</Label>
              <div>
                <Segmented<BrandMode>
                  value={form.defaultMode ?? 'system'}
                  onChange={(defaultMode) => set({ defaultMode: defaultMode === 'system' ? undefined : defaultMode })}
                  options={[
                    { value: 'light', label: tr('Light', 'فاتح'), icon: <Sun className="h-3.5 w-3.5" /> },
                    { value: 'dark', label: tr('Dark', 'داكن'), icon: <Moon className="h-3.5 w-3.5" /> },
                    { value: 'system', label: tr('Device', 'حسب الجهاز'), icon: <Monitor className="h-3.5 w-3.5" /> },
                  ]}
                />
              </div>
              <p className="text-xs text-muted-foreground">{tr('Each person can still switch for themselves.', 'يقدر كل موظف يغيّره لنفسه.')}</p>
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={resetToDefault}
            disabled={saving || !selectedCompany.branding}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            {tr('Back to standard look', 'الرجوع للشكل الافتراضي')}
          </Button>
          <div className="flex gap-2">
            {dirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm(saved);
                  setLogoUrl(selectedCompany.logoUrl);
                }}
                disabled={saving}
              >
                {tr('Discard changes', 'تجاهل التعديلات')}
              </Button>
            )}
            <Button type="button" onClick={() => persist(form, logoUrl)} disabled={saving || !dirty}>
              {saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save brand', 'حفظ الهوية')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
