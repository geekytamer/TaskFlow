import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Manrope } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/pwa-register';
import { getHost } from '@/lib/audience';
import { dirFor } from '@/lib/i18n';
import { getBranding } from '@/lib/portal';
import { currentLang } from '@/lib/session';

const latin = Manrope({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-arabic',
  display: 'swap',
});

export const viewport: Viewport = { themeColor: '#050505' };

export async function generateMetadata(): Promise<Metadata> {
  const host = getHost();
  // The lobby shares the client portal's branding endpoint: same company, no session.
  const branding = await getBranding(host === 'lobby' ? 'client' : host);
  // The lobby is public on purpose; the portals are not for search engines.
  // Installed on a phone, the portal opens full screen with its own icon.
  const app = { appleWebApp: { capable: true, title: branding?.name ?? 'Portal', statusBarStyle: 'black-translucent' as const }, icons: { apple: '/icons/180' } };
  return host === 'lobby'
    ? { title: branding?.name ?? 'Games', ...app }
    : { title: branding?.name ?? 'Portal', robots: { index: false, follow: false }, ...app };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} dir={dirFor(lang)} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-[100dvh] font-sans"><PwaRegister />{children}</body>
    </html>
  );
}
