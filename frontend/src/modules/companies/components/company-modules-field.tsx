'use client';

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/context/i18n-context';
import { fetchCatalogue } from '@/services/permissionService';
import { moduleLabel } from '@/modules/permissions/lib/labels';

/**
 * Module switches for one company, for the platform super admin. The server
 * refuses the change from anyone else.
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
  const [modules, setModules] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    let active = true;
    fetchCatalogue()
      .then(({ modules: all, alwaysOnModules }) => {
        if (!active) return;
        const alwaysOn = new Set(alwaysOnModules ?? []);
        setModules(all.map((m) => m.key).filter((key) => !alwaysOn.has(key)));
      })
      .catch(() => {
        if (active) setModules([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-2" data-testid="company-modules">
      <div>
        <Label>{tr('Modules', 'الوحدات')}</Label>
        <p className="text-xs text-muted-foreground">
          {tr(
            'A module switched off is hidden and refused for everyone in this company, admins included. Group permissions are kept for when it is switched back on.',
            'الوحدة المتوقفة مخفية وممنوعة عن الجميع في هذه الشركة، بمن فيهم المسؤولون. تُحفظ صلاحيات المجموعات لحين إعادة تشغيلها.',
          )}
        </p>
      </div>
      {modules === null ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3">
          {modules.map((key) => {
            const on = !value.includes(key);
            const id = `module-switch-${key}`;
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className={on ? 'text-sm font-normal' : 'text-sm font-normal text-muted-foreground'}>
                  {moduleLabel(key, t)}
                </Label>
                <Switch
                  id={id}
                  checked={on}
                  onCheckedChange={(checked) =>
                    onChange(checked ? value.filter((k) => k !== key) : [...value, key].sort())
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
