// Service worker: hace que la app se pueda instalar y recibe los avisos (push).
// No guarda nada en caché a propósito: cada deploy de Vercel se ve al toque, sin versiones viejas trabadas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* pasa directo a la red */ });

self.addEventListener('push', e => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch { n = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(n.title || 'El Partidito', {
    body: n.body || '',
    icon: '/icon-192.png?v=2',
    badge: '/icon-192.png?v=2',
    tag: n.tag,
    renotify: !!n.tag && !String(n.tag).startsWith('chat-'), // el chat se agrupa sin volver a sonar
    data: { url: n.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        return c.navigate(url).catch(() => c.postMessage({ goto: url }));
      }
    }
    return self.clients.openWindow(url);
  })());
});
