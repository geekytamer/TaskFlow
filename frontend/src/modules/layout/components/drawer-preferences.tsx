'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';
import { useTheme, type ThemePreference } from '@/context/theme-context';
import { cn } from '@/lib/utils';

/**
 * Language and light/dark, inside the phone menu: the top bar has no room
 * for them there. Wider screens keep them in the top bar.
 */
export function DrawerPreferences() {
  const { language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const ar = language === 'ar';

  const pill = (active: boolean) =>
    cn(
      'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
      active
        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    );

  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: ar ? 'فاتح' : 'Light', icon: Sun },
    { value: 'dark', label: ar ? 'داكن' : 'Dark', icon: Moon },
    { value: 'system', label: ar ? 'الجهاز' : 'Device', icon: Monitor },
  ];

  return (
    <div className="space-y-2 px-2 pb-2 md:hidden">
      <div className="flex gap-1 rounded-lg bg-sidebar-accent/50 p-1" role="group" aria-label={ar ? 'اللغة' : 'Language'}>
        <button type="button" className={pill(!ar)} onClick={() => setLanguage('en')} aria-pressed={!ar}>English</button>
        <button type="button" className={pill(ar)} onClick={() => setLanguage('ar')} aria-pressed={ar}>العربية</button>
      </div>
      <div className="flex gap-1 rounded-lg bg-sidebar-accent/50 p-1" role="group" aria-label={ar ? 'المظهر' : 'Theme'}>
        {themes.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" className={pill(theme === value)} onClick={() => setTheme(value)} aria-pressed={theme === value}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
