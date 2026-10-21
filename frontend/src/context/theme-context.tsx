'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_KEY = 'taskflow_theme';
/** The last company brand seen on this device (see modules/branding/brand-context). */
export const BRAND_CACHE_KEY = 'taskflow_brand';

// Printable documents (invoices, quotations, delivery notes...) are paper:
// they always render light, whatever the viewer picked for the app.
const PAPER_ROUTES = ['/invoice/', '/quotation/', '/delivery/', '/vendor-bill/', '/document/', '/finance/'];

export function isPaperRoute(pathname: string | null | undefined) {
  return !!pathname && PAPER_ROUTES.some((p) => pathname.startsWith(p));
}

// Runs in <head> before first paint: puts the remembered brand and the right
// light/dark mode on the page so nobody sees TaskFlow's indigo or a white flash first.
export const themeBootScript = `(function(){try{var p=location.pathname;var paper=${JSON.stringify(
  PAPER_ROUTES,
)}.some(function(r){return p.indexOf(r)===0});var b=null;try{b=JSON.parse(localStorage.getItem('${BRAND_CACHE_KEY}')||'null')}catch(e){}if(b&&b.css&&p.indexOf('/admin')!==0){var s=document.createElement('style');s.id='company-brand-boot';s.textContent=b.css;document.head.appendChild(s);if(b.fontHref){var l=document.createElement('link');l.rel='stylesheet';l.href=b.fontHref;document.head.appendChild(l)}}var t=localStorage.getItem('${THEME_KEY}')||(b&&b.defaultMode)||'system';var d=!paper&&(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})();`;

type ThemeContextValue = {
  /** What is in effect: the viewer's own pick, else the company's default, else system. */
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemePreference) => void;
  /** The company's default mode, used until the viewer picks one. */
  setCompanyDefault: (mode: ThemePreference | undefined) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [chosen, setChosen] = React.useState<ThemePreference | null>(null);
  const [companyDefault, setCompanyDefault] = React.useState<ThemePreference | undefined>(undefined);
  const [systemDark, setSystemDark] = React.useState(false);

  React.useEffect(() => {
    setChosen(readStored());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    // Another tab changed the preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setChosen(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const theme: ThemePreference = chosen ?? companyDefault ?? 'system';
  const resolvedTheme: 'light' | 'dark' =
    theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light';
  const applied = isPaperRoute(pathname) ? 'light' : resolvedTheme;

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', applied === 'dark');
    root.style.colorScheme = applied;
  }, [applied]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    setChosen(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, setCompanyDefault }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
