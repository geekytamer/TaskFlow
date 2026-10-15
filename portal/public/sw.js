/*
 * The portal's service worker: shows phone notifications and opens the page
 * each one is about. It caches nothing; every page still comes from the server.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* The badge is the number of threads with unread messages, on the app icon where supported. */
const setBadge = async (count) => {
  const nav = self.navigator;
  if (typeof count !== 'number' || !nav) return;
  try {
    if (count > 0 && typeof nav.setAppBadge === 'function') await nav.setAppBadge(count);
    else if (count <= 0 && typeof nav.clearAppBadge === 'function') await nav.clearAppBadge();
  } catch { /* badges are a nicety */ }
};

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : '' }; }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'Notification', {
      body: data.body || '',
      tag: data.tag,
      // A thread's later push replaces its earlier one (same tag) and sounds again.
      renotify: !!(data.renotify && data.tag),
      data: { url: data.url || '/' },
      icon: '/icons/192',
      badge: '/icons/192',
    }),
    setBadge(data.badge),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url).catch(() => undefined);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
