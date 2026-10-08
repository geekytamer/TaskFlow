import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'TaskFlow',
  description: 'Employee Task Management System with a custom backend',
  // Installed on a phone, TaskFlow opens full screen with its own icon.
  appleWebApp: { capable: true, title: 'TaskFlow', statusBarStyle: 'default' },
  icons: { apple: '/icons/180' },
};

export const viewport: Viewport = { themeColor: '#5B6AF0' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
