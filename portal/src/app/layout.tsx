import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Manrope } from 'next/font/google';
import './globals.css';
import { getAudience } from '@/lib/audience';
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
  const branding = await getBranding(getAudience());
  return { title: branding?.name ?? 'Portal', robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang} dir={dirFor(lang)} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-[100dvh] font-sans">{children}</body>
    </html>
  );
}
