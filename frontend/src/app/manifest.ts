import type { MetadataRoute } from 'next';

/** Makes the app installable: a home-screen icon that opens full screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'مجموعة اليعربي',
    short_name: 'اليعربي',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a1929',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
