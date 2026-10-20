/**
 * A company's own look: pure helpers that turn its saved brand into CSS.
 * The app's colours are HSL triplets in CSS variables (globals.css), so a
 * brand only has to override a handful of them for light and dark.
 */

export type BrandFont = 'default' | 'ibm-plex' | 'tajawal' | 'cairo' | 'inter';
export type BrandRadius = 'sharp' | 'soft' | 'round';
export type BrandMode = 'light' | 'dark' | 'system';

export interface CompanyBranding {
  enabled: boolean;
  displayName?: string;
  primaryColor?: string;
  sidebarColor?: string;
  font?: BrandFont;
  radius?: BrandRadius;
  defaultMode?: BrandMode;
}

export const PRODUCT_NAME = 'TaskFlow';

export const BRAND_FONTS: Record<BrandFont, { label: string; family: string | null; google: string | null }> = {
  default: { label: 'PT Sans', family: null, google: null },
  'ibm-plex': {
    label: 'IBM Plex Sans Arabic',
    family: "'IBM Plex Sans Arabic', 'IBM Plex Sans', sans-serif",
    google: 'family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700',
  },
  tajawal: { label: 'Tajawal', family: "'Tajawal', sans-serif", google: 'family=Tajawal:wght@400;500;700' },
  cairo: { label: 'Cairo', family: "'Cairo', sans-serif", google: 'family=Cairo:wght@400;500;600;700' },
  inter: { label: 'Inter', family: "'Inter', sans-serif", google: 'family=Inter:wght@400;500;600;700' },
};

export const BRAND_RADII: Record<BrandRadius, string> = {
  sharp: '0.25rem',
  soft: '0.625rem',
  round: '1rem',
};

/** Colours offered as one-click choices in the brand panel. */
export const BRAND_SWATCHES = [
  '#5b6af0', '#f26a1b', '#e11d48', '#16a34a', '#0891b2', '#7c3aed', '#ca8a04', '#111111',
];

type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: Hsl): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslToRgb(c).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const triplet = ({ h, s, l }: Hsl) => `${h} ${s}% ${l}%`;
const WHITE = '0 0% 100%';
const INK = '224 30% 10%';

/** White or near-black text, whichever reads better on the colour. */
export function readableOn(c: Hsl): string {
  const lum = luminance(c);
  // Prefer white unless dark ink is clearly better: brand buttons usually carry white text.
  return contrast(lum, 1) >= 3 || contrast(lum, 1) >= contrast(lum, 0.01) ? WHITE : INK;
}

/** A primary colour light enough to stand out on the dark background. */
export function forDarkBackground(c: Hsl): Hsl {
  return { ...c, l: Math.max(c.l, 60), s: Math.min(c.s, 90) };
}

/** Sidebar shades: a hover/active tint and a border, derived from its colour. */
function sidebarShades(c: Hsl) {
  const dark = luminance(c) < 0.3;
  const shift = (d: number) => ({ ...c, l: Math.max(0, Math.min(100, c.l + (dark ? d : -d))) });
  return {
    '--sidebar-background': triplet(c),
    '--sidebar-foreground': dark ? '0 0% 88%' : INK,
    '--sidebar-accent': triplet(shift(9)),
    '--sidebar-accent-foreground': dark ? WHITE : INK,
    '--sidebar-border': triplet(shift(7)),
  };
}

type Vars = Record<string, string>;

/** CSS variables for light mode (`light`) and the `.dark` overrides (`dark`). */
export function brandVariables(branding: CompanyBranding | null | undefined): { light: Vars; dark: Vars } {
  const light: Vars = {};
  const dark: Vars = {};
  if (!branding) return { light, dark };

  const primary = branding.primaryColor ? hexToHsl(branding.primaryColor) : null;
  if (primary) {
    Object.assign(light, {
      '--primary': triplet(primary),
      '--primary-foreground': readableOn(primary),
      '--ring': triplet(primary),
      '--chart-1': triplet(primary),
      '--sidebar-primary': triplet(primary),
      '--sidebar-primary-foreground': readableOn(primary),
      '--sidebar-ring': triplet(primary),
    });
    const onDark = forDarkBackground(primary);
    Object.assign(dark, {
      '--primary': triplet(onDark),
      '--primary-foreground': readableOn(onDark),
      '--ring': triplet(onDark),
      '--chart-1': triplet(onDark),
      '--sidebar-primary': triplet(onDark),
      '--sidebar-primary-foreground': readableOn(onDark),
      '--sidebar-ring': triplet(onDark),
    });
  }

  const sidebar = branding.sidebarColor ? hexToHsl(branding.sidebarColor) : null;
  if (sidebar) {
    Object.assign(light, sidebarShades(sidebar));
    // A dark brand sidebar suits dark mode as it is; a light one would glare, so
    // dark mode keeps its own sidebar then.
    if (luminance(sidebar) < 0.3) Object.assign(dark, sidebarShades(sidebar));
  }

  if (branding.radius) light['--radius'] = BRAND_RADII[branding.radius];
  return { light, dark };
}

/** The stylesheet that applies a brand. Empty when there is nothing to change. */
export function brandCss(branding: CompanyBranding | null | undefined): string {
  if (!branding) return '';
  const { light, dark } = brandVariables(branding);
  const block = (sel: string, vars: Vars) => {
    const body = Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('');
    return body ? `${sel}{${body}}` : '';
  };
  const font = branding.font ? BRAND_FONTS[branding.font]?.family : null;
  return [
    block(':root', light),
    block(':root.dark', dark),
    font ? `body,.font-body,.font-headline{font-family:${font}!important}` : '',
  ].join('');
}

export function brandFontHref(branding: CompanyBranding | null | undefined): string | null {
  const google = branding?.font ? BRAND_FONTS[branding.font]?.google : null;
  return google ? `https://fonts.googleapis.com/css2?${google}&display=swap` : null;
}

/** The name shown where the app would say "TaskFlow". */
export function brandName(
  branding: CompanyBranding | null | undefined,
  companyName: string | null | undefined,
): string {
  if (!branding?.enabled) return PRODUCT_NAME;
  return branding.displayName?.trim() || companyName?.trim() || PRODUCT_NAME;
}
