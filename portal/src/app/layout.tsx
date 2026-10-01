import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Manrope } from 'next/font/google';
import './globals.css';
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

export async function generateMetadata(): Promise<Metadata> {
  const host = getHost();
  // The lobby shares the client portal's branding endpoint: same company, no session.
  const branding = await getBranding(host === 'lobby' ? 'client' : host);
  // The lobby is public on purpose; the portals are not for search engines.
  return host === 'lobby'
    ? { title: branding?.name ?? 'Games' }
    : { title: branding?.name ?? 'Portal', robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} dir={dirFor(lang)} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-[100dvh] font-sans">{children}</body>
    </html>
  );
}
