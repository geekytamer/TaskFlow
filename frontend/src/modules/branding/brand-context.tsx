'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useCompany } from '@/context/company-context';
import { BRAND_CACHE_KEY, useTheme } from '@/context/theme-context';
import { useI18n } from '@/context/i18n-context';
import { brandCss, brandFontHref, brandName, PRODUCT_TOKEN, productName, type BrandMode, type CompanyBranding } from './brand';

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
  /** True when a company brand is in effect (its name and logo replace the group's). */
  branded: boolean;
  /** False for the first moment, before this device's remembered brand is read. */
  ready: boolean;
  /** The group's name, or the company's when branded. */
  name: string;
  logoUrl?: string;
  /** Swaps the product word ("TaskFlow" in source copy) for the shown name. */
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
  const { language } = useI18n();
  const product = productName(language);
  const pathname = usePathname();
  const [preview, setPreview] = React.useState<{ branding: CompanyBranding | null; logoUrl?: string }>();
  // undefined until read: rendering must match the server first, so the cache loads after mount.
  const [cache, setCache] = React.useState<BrandCache | null | undefined>(undefined);

  React.useEffect(() => setCache(readCache()), []);

  // The platform admin area is the group's own, never a company's.
  const platformArea = !!pathname?.startsWith('/admin');

  const saved = selectedCompany?.branding?.enabled ? selectedCompany.branding : null;
  const active = preview ? (preview.branding?.enabled ? preview.branding : null) : saved;
  const logoUrl = preview ? preview.logoUrl : selectedCompany?.logoUrl;

  // Before a company is known (login page, first load) the remembered brand stands in.
  const known = !!selectedCompany || !!preview;
  const branded = !platformArea && (known ? !!active : !!cache);
  const name = platformArea
    ? product
    : known
      ? brandName(active, selectedCompany?.name, product)
      : cache?.name ?? product;
  const shownLogo = branded ? (known ? logoUrl : cache?.logoUrl) : undefined;
  const ready = known || cache !== undefined;

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
      name: brandName(saved, selectedCompany.name, product),
      logoUrl: logo && logo.length <= MAX_CACHED_LOGO ? logo : undefined,
      css: brandCss(saved),
      fontHref: brandFontHref(saved),
      defaultMode: saved.defaultMode,
    };
    writeCache(next);
    setCache(next);
  }, [selectedCompany, saved, loading, product]);

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

  // Browser tab: the shown name. The tab icon stays the group's logo for every company.
  React.useEffect(() => {
    if (!ready) return;
    const set = () => {
      if (document.title !== name) document.title = name;
    };
    set();
    // Next swaps the <title> node on navigation, so watch the whole head.
    const observer = new MutationObserver(set);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [ready, name]);

  const brandText = React.useCallback(
    (text: string) => text.replaceAll(PRODUCT_TOKEN, name),
    [name],
  );

  const value = React.useMemo(
    () => ({ branded, ready, name, logoUrl: shownLogo, brandText, setPreview }),
    [branded, ready, name, shownLogo, brandText],
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = React.useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
