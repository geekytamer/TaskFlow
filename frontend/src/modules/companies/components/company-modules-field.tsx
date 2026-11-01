'use client';

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/i18n-context';
import { fetchCatalogue, type ModuleArea, type ModulePreset } from '@/services/permissionService';
import { moduleLabel } from '@/modules/permissions/lib/labels';
import { presetFor } from '../lib/company-modules';

/**
 * Module switches for one company, for the platform super admin: a preset to
 * start from (factory, agency...), then each business area and its modules
 * ticked on or off. The server refuses the change from anyone else.
 */
export function CompanyModulesField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (disabledModules: string[]) => void;
}) {
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [catalogue, setCatalogue] = React.useState<{ areas: ModuleArea[]; presets: ModulePreset[] } | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchCatalogue()
      .then(({ moduleAreas, modulePresets }) => {
        if (active) setCatalogue({ areas: moduleAreas ?? [], presets: modulePresets ?? [] });
      })
      .catch(() => {
        if (active) setCatalogue({ areas: [], presets: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const off = new Set(value);
  const setModules = (modules: string[], on: boolean) => {
    const next = new Set(value);
    modules.forEach((m) => (on ? next.delete(m) : next.add(m)));
    onChange([...next].sort());
  };
  const current = catalogue ? presetFor(value, catalogue.presets) : undefined;
  const total = catalogue?.areas.reduce((n, a) => n + a.modules.length, 0) ?? 0;

  return (
    <div className="space-y-3" data-testid="company-modules">
      <div>
        <Label>{tr('Modules', 'الوحدات')}</Label>
        <p className="text-xs text-muted-foreground">
          {tr(
            'Pick what this company does. A module switched off is hidden and refused for everyone in this company, admins included. Group permissions are kept for when it is switched back on.',
            'اختر ما تعمل به هذه الشركة. الوحدة المتوقفة مخفية وممنوعة عن الجميع في هذه الشركة، بمن فيهم المسؤولون. تُحفظ صلاحيات المجموعات لحين إعادة تشغيلها.',
          )}
        </p>
      </div>
      {catalogue === null ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tr('Start from', 'ابدأ من')}>
            <span className="me-1 text-xs text-muted-foreground">{tr('Start from', 'ابدأ من')}</span>
            {catalogue.presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                aria-pressed={current === preset.key}
                data-testid={`module-preset-${preset.key}`}
                onClick={() => onChange([...preset.disabledModules].sort())}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  current === preset.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-muted',
                )}
              >
                {t(`modules.preset.${preset.key}`)}
              </button>
            ))}
            {!current && (
              <span className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
                {t('modules.preset.custom')}
              </span>
            )}
            <span className="ms-auto text-xs tabular-nums text-muted-foreground">
              {tr(`${total - value.length} of ${total} on`, `${total - value.length} من ${total} مفعّلة`)}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {catalogue.areas.map((area) => {
              const onCount = area.modules.filter((m) => !off.has(m)).length;
              const areaId = `module-area-${area.key}`;
              return (
                <fieldset key={area.key} className="rounded-md border p-3" data-testid={areaId}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label htmlFor={areaId} className="text-sm font-semibold">
                      {t(`modules.area.${area.key}`)}
                      <span className="ms-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                        {onCount}/{area.modules.length}
                      </span>
                    </Label>
                    <Switch
                      id={areaId}
                      checked={onCount > 0}
                      aria-label={t(`modules.area.${area.key}`)}
                      onCheckedChange={(checked) => setModules(area.modules, checked)}
                    />
                  </div>
                  <div className="space-y-1.5 border-t pt-2">
                    {area.modules.map((key) => {
                      const on = !off.has(key);
                      const id = `module-switch-${key}`;
                      return (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <Label
                            htmlFor={id}
                            className={cn('text-sm font-normal', !on && 'text-muted-foreground line-through decoration-muted-foreground/40')}
                          >
                            {moduleLabel(key, t)}
                          </Label>
                          <Switch
                            id={id}
                            checked={on}
                            className="scale-90"
                            onCheckedChange={(checked) => setModules([key], checked)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
