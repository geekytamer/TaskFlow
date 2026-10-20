import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa-register';
import { themeBootScript } from '@/context/theme-context';

export const metadata: Metadata = {
  title: 'مجموعة اليعربي',
  description: 'Al Yarubi Group — business management',
  // Installed on a phone, the app opens full screen with its own icon.
  appleWebApp: { capable: true, title: 'اليعربي', statusBarStyle: 'default' },
  icons: { icon: '/brand/favicon.png', apple: '/icons/180' },
};

export const viewport: Viewport = { themeColor: '#0a1929' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <PwaRegister />
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
