'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_KEY = 'taskflow_theme';

// Printable documents (invoices, quotations, delivery notes...) are paper:
// they always render light, whatever the viewer picked for the app.
const PAPER_ROUTES = ['/invoice/', '/quotation/', '/delivery/', '/vendor-bill/', '/document/', '/finance/'];

export function isPaperRoute(pathname: string | null | undefined) {
  return !!pathname && PAPER_ROUTES.some((p) => pathname.startsWith(p));
}

// Runs in <head> before first paint so a dark-mode user never sees a white flash.
export const themeBootScript = `(function(){try{var p=location.pathname;var paper=${JSON.stringify(
  PAPER_ROUTES,
)}.some(function(r){return p.indexOf(r)===0});var t=localStorage.getItem('${THEME_KEY}')||'system';var d=!paper&&(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`;

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = React.useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = React.useState(false);

  React.useEffect(() => {
    setThemeState(readStored());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    // Another tab changed the preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setThemeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light';
  const applied = isPaperRoute(pathname) ? 'light' : resolvedTheme;

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', applied === 'dark');
    root.style.colorScheme = applied;
  }, [applied]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    setThemeState(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }, []);

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
