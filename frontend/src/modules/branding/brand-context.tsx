'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useCompany } from '@/context/company-context';
import { BRAND_CACHE_KEY, useTheme } from '@/context/theme-context';
import { brandCss, brandFontHref, brandName, PRODUCT_NAME, type BrandMode, type CompanyBranding } from './brand';

/** What this device remembers of the last brand, for the login page and first paint. */
type BrandCache = {
  name: string;
  logoUrl?: string;
  css: string;
  fontHref?: string | null;
  defaultMode?: BrandMode;
};

// Logos are stored as data URIs; a huge one is not worth a slice of localStorage.
const MAX_CACHED_LOGO = 150_000;

function readCache(): BrandCache | null {
  try {
    const v = JSON.parse(localStorage.getItem(BRAND_CACHE_KEY) || 'null');
    return v && typeof v.name === 'string' ? v : null;
  } catch {
    return null;
  }
}

function writeCache(cache: BrandCache | null) {
  try {
    if (cache) localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(cache));
    else localStorage.removeItem(BRAND_CACHE_KEY);
  } catch {}
}

type BrandContextValue = {
  /** True when a company brand is in effect (its name and logo replace TaskFlow's). */
  branded: boolean;
  /** False for the first moment, before this device's remembered brand is read. */
  ready: boolean;
  /** "TaskFlow", or the company's name when branded. */
  name: string;
  logoUrl?: string;
  /** Swaps "TaskFlow" in a sentence for the brand's name. */
  brandText: (text: string) => string;
  /** Shows a brand across the app without saving it (brand settings preview). `undefined` ends it. */
  setPreview: (preview: { branding: CompanyBranding | null; logoUrl?: string } | undefined) => void;
};

const BrandContext = React.createContext<BrandContextValue | null>(null);

function upsertHeadNode<T extends HTMLElement>(id: string, create: () => T): T {
  const existing = document.getElementById(id) as T | null;
  if (existing) return existing;
  const node = create();
  node.id = id;
  document.head.appendChild(node);
  return node;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { selectedCompany: selected, companies, loading } = useCompany();
  // An Academy practice company wears the brand of the trainee's real company.
  const selectedCompany = React.useMemo(
    () =>
      selected?.isTraining
        ? companies.find((c) => !c.isTraining && c.branding?.enabled) ?? selected
        : selected,
    [selected, companies],
  );
  const { setCompanyDefault } = useTheme();
  const pathname = usePathname();
  const [preview, setPreview] = React.useState<{ branding: CompanyBranding | null; logoUrl?: string }>();
  // undefined until read: rendering must match the server first, so the cache loads after mount.
  const [cache, setCache] = React.useState<BrandCache | null | undefined>(undefined);

  React.useEffect(() => setCache(readCache()), []);

  // The platform admin area is TaskFlow's own, never a company's.
  const platformArea = !!pathname?.startsWith('/admin');

  const saved = selectedCompany?.branding?.enabled ? selectedCompany.branding : null;
  const active = preview ? (preview.branding?.enabled ? preview.branding : null) : saved;
  const logoUrl = preview ? preview.logoUrl : selectedCompany?.logoUrl;

  // Before a company is known (login page, first load) the remembered brand stands in.
  const known = !!selectedCompany || !!preview;
  const branded = !platformArea && (known ? !!active : !!cache);
  const name = platformArea
    ? PRODUCT_NAME
    : known
      ? brandName(active, selectedCompany?.name)
      : cache?.name ?? PRODUCT_NAME;
  const shownLogo = branded ? (known ? logoUrl : cache?.logoUrl) : undefined;

  // Remember the saved brand on this device; forget it when the company has none.
  React.useEffect(() => {
    if (!selectedCompany || loading) return;
    if (!saved) {
      writeCache(null);
      setCache(null);
      return;
    }
    const logo = selectedCompany.logoUrl;
    const next: BrandCache = {
      name: brandName(saved, selectedCompany.name),
      logoUrl: logo && logo.length <= MAX_CACHED_LOGO ? logo : undefined,
      css: brandCss(saved),
      fontHref: brandFontHref(saved),
      defaultMode: saved.defaultMode,
    };
    writeCache(next);
    setCache(next);
  }, [selectedCompany, saved, loading]);

  // Apply the colours, corners and font.
  const css = platformArea ? '' : known ? brandCss(active) : cache?.css ?? '';
  const fontHref = platformArea ? null : known ? brandFontHref(active) : cache?.fontHref ?? null;
  React.useEffect(() => {
    // Until the cache is read, the boot script's copy of the brand stays on screen.
    if (!known && cache === undefined) return;
    document.getElementById('company-brand-boot')?.remove();
    upsertHeadNode('company-brand', () => document.createElement('style')).textContent = css;
  }, [css, known, cache]);
  React.useEffect(() => {
    const link = upsertHeadNode('company-brand-font', () => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      return l;
    });
    if (fontHref) link.href = fontHref;
    else link.removeAttribute('href');
  }, [fontHref]);

  // The company's default light/dark mode, until the viewer picks their own.
  const defaultMode = platformArea ? undefined : known ? active?.defaultMode : cache?.defaultMode;
  React.useEffect(() => setCompanyDefault(defaultMode), [defaultMode, setCompanyDefault]);

  // Browser tab: the brand's name and logo.
  React.useEffect(() => {
    if (!branded) return;
    const set = () => {
      if (document.title.includes(PRODUCT_NAME)) document.title = document.title.replaceAll(PRODUCT_NAME, name);
    };
    set();
    // Next swaps the <title> node on navigation, so watch the whole head.
    const observer = new MutationObserver(set);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replaceAll(name, PRODUCT_NAME);
    };
  }, [branded, name, pathname]);
  React.useEffect(() => {
    if (!shownLogo) return;
    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    const before = icons.map((l) => l.href);
    icons.forEach((l) => { l.href = shownLogo; });
    const own = upsertHeadNode('company-brand-icon', () => {
      const l = document.createElement('link');
      l.rel = 'icon';
      return l;
    });
    own.href = shownLogo;
    return () => {
      icons.forEach((l, i) => { l.href = before[i]; });
      own.remove();
    };
  }, [shownLogo]);

  const brandText = React.useCallback(
    (text: string) => (name === PRODUCT_NAME ? text : text.replaceAll(PRODUCT_NAME, name)),
    [name],
  );

  const value = React.useMemo(
    () => ({ branded, ready: known || cache !== undefined, name, logoUrl: shownLogo, brandText, setPreview }),
    [branded, known, cache, name, shownLogo, brandText],
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = React.useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
