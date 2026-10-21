/*
 * The app's service worker: shows phone notifications and opens the page each
 * one is about, and keeps the app's own files (scripts, styles, icons) on the
 * device so the installed app opens fast. Pages and data always come from the
 * server; only files the server marks immutable are kept, so a deploy can never
 * be shadowed by an old copy.
 *
 * Registered as /sw.js?api=<API base> (components/pwa-register.tsx), so the
 * "Mark done" button knows where to post. A conversation push replaces the
 * thread's earlier one (same tag) and sounds again (renotify); its badge is the
 * inbox count, shown on the app icon where the browser supports it.
 */
const API_BASE = (() => {
  try { return (new URL(self.location.href).searchParams.get('api') || '').replace(/\/+$/, ''); } catch { return ''; }
})();

// Bump when the app icons change: they are kept until the cache name changes.
const STATIC_CACHE = 'app-static-v1';
const MAX_FILES = 300;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('app-static-') && n !== STATIC_CACHE).map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

const isAppFile = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/icons/'));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isAppFile(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    // Hashed build files are immutable; icons and the logo change only with a deploy
    // and carry a day's max-age. Dev-server files are neither, so they never stick.
    const cc = response.headers.get('cache-control') || '';
    const keep = response.ok && (cc.includes('immutable') || (/max-age=\d{4,}/.test(cc) && !url.pathname.startsWith('/_next/')));
    if (keep) {
      await cache.put(request, response.clone()).catch(() => undefined);
      // Each deploy brings new file names; drop the oldest so the cache stays small.
      const keys = await cache.keys();
      if (keys.length > MAX_FILES) await Promise.all(keys.slice(0, keys.length - MAX_FILES).map((k) => cache.delete(k)));
    }
    return response;
  })());
});

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
  const canAct = !!(data.actionToken && API_BASE);
  const actions = Array.isArray(data.actions)
    ? data.actions.filter((a) => a && (a.action === 'open' || (a.action === 'done' && canAct))).map((a) => ({ action: a.action, title: String(a.title || a.action) }))
    : [];
  const options = {
    body: data.body || '',
    tag: data.tag,
    renotify: !!(data.renotify && data.tag),
    data: { url: data.url || '/', actionToken: canAct ? data.actionToken : undefined },
    icon: '/icons/192',
    badge: '/icons/192',
  };
  if (actions.length > 0) options.actions = actions;
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'Notification', options),
    setBadge(data.badge),
  ]));
});

const openPage = async (path) => {
  const url = new URL(path || '/', self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
      await client.focus();
      if ('navigate' in client) await client.navigate(url).catch(() => undefined);
      return;
    }
  }
  await self.clients.openWindow(url);
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === 'done' && data.actionToken && API_BASE) {
    // Closes the thread without opening the app; if that is refused, open it instead.
    event.waitUntil((async () => {
      try {
        const res = await fetch(`${API_BASE}/push-actions/${encodeURIComponent(data.actionToken)}`, { method: 'POST', credentials: 'omit' });
        if (res.ok) return;
      } catch { /* offline: fall through */ }
      await openPage(data.url);
    })());
    return;
  }
  event.waitUntil(openPage(data.url));
});
