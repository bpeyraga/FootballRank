// Service worker: instalación (PWA), avisos (push) y modo sin conexión.
//
// Regla de oro: cada deploy de Vercel se ve al toque, sin versiones viejas trabadas.
//  - El documento (index.html) va red primero: si la red contesta en 3 s, siempre se ve la versión nueva. La copia guardada solo
//    aparece sin conexión o si la red tarda más de 3 s (y mientras tanto se baja la nueva para la próxima).
//  - /assets/* tiene el hash en el nombre (nunca cambia el contenido de un archivo): primero el caché.
//  - Íconos, manifest e imágenes: sale lo guardado y se actualiza de fondo.
//  - Lecturas de Supabase (GET a /rest/v1/): red primero; el caché solo si la red falla. Son datos privados: cada usuario tiene
//    su caché (por el `sub` del token) y se borran al cerrar sesión (mensaje 'fr-clear-data' desde la página).
//  - Todo lo demás (login, escrituras, RPC por POST, storage, funciones, realtime) pasa directo a la red.
// La decisión de qué hacer con cada pedido es pura y está en sw-core.js (con tests en src/app/sw.test.ts).
importScripts('/sw-core.js');
const C = self.SWCore;

// Contador que sube cada vez que se borran los datos: una lectura que estaba en vuelo al cerrar sesión no se guarda después.
let wipes = 0;
let lastData = null; // caché de datos del último usuario visto en esta ejecución del service worker

const never = new Promise(() => {});
const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

/** Guarda `res` y deja como máximo `max` entradas (las más viejas se van primero). Nunca tira. */
async function put(cacheName, key, res, max) {
  await safe(async () => {
    const cache = await caches.open(cacheName);
    await cache.put(key, res);
    if (!max) return;
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  });
}

/** Baja y guarda los archivos de /assets/ que nombra ese index.html (los que todavía no están). Nunca tira. */
async function precacheAssets(htmlRes) {
  await safe(async () => {
    const urls = C.assetsIn(await htmlRes.text());
    const cache = await caches.open(C.ASSETS);
    await Promise.all(urls.map(async url => {
      if (await safe(() => cache.match(url))) return;
      const r = await safe(() => fetch(url));
      if (r && C.cacheableAsset(r.status, r.type, r.headers.get('content-type'))) await put(C.ASSETS, url, r);
    }));
  });
}

// ---------- Ciclo de vida ----------
self.addEventListener('install', e => {
  self.skipWaiting();
  // Deja lista la app para abrir sin conexión desde la primera vez: el documento y los archivos que nombra. Si falla, no importa.
  e.waitUntil(safe(async () => {
    const res = await fetch('/', { cache: 'no-cache' });
    // Una respuesta que vino de una redirección no se puede entregar después a una navegación: no se guarda
    if (res.redirected || !C.cacheableDocument(res.status, res.type, res.headers.get('content-type'))) return;
    const forAssets = res.clone();
    await put(C.SHELL, '/index.html', res);
    await precacheAssets(forAssets);
  }));
});

self.addEventListener('activate', e => e.waitUntil((async () => {
  // Borra los cachés de versiones anteriores de este service worker (solo los que empiezan con "fr-")
  await safe(async () => { for (const n of C.staleCaches(await caches.keys(), null)) await caches.delete(n); });
  // La petición del documento sale en paralelo con el arranque del service worker (ahorra unos cientos de ms)
  await safe(() => self.registration.navigationPreload && self.registration.navigationPreload.enable());
  await self.clients.claim();
})()));

// La página avisa al cerrar sesión: se borran todas las lecturas guardadas (son datos privados).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'fr-clear-data') e.waitUntil(wipe());
});

async function wipe() {
  wipes++;
  lastData = null;
  await safe(async () => { for (const n of C.dataCaches(await caches.keys())) await caches.delete(n); });
}

// ---------- Pedidos ----------
self.addEventListener('fetch', e => {
  const r = C.route(e.request.method, e.request.mode, e.request.url, self.location.origin);
  if (r === 'nav') e.respondWith(navigate(e));
  else if (r === 'asset') e.respondWith(cacheFirst(e));
  else if (r === 'static') e.respondWith(staleWhileRevalidate(e));
  else if (r === 'data') e.respondWith(readData(e));
  // 'skip': sin respondWith, lo resuelve el navegador como siempre
});

/** Documento: red primero (con tope de 3 s si hay copia). Sin red, la copia guardada; sin copia, el error de siempre. */
async function navigate(e) {
  const req = e.request;
  const key = C.shellKey(req.url);
  const cached = await safe(async () => (await caches.open(C.SHELL)).match(key));
  const timer = { id: 0, late: false };
  const timeout = cached && C.isAppShell(req.url)
    ? new Promise(res => { timer.id = setTimeout(() => { timer.late = true; res('timeout'); }, C.NAV_TIMEOUT_MS); })
    : never;
  const fetched = (async () => (await safe(() => e.preloadResponse)) || fetch(req))();
  // La copia nueva se guarda siempre, aunque ya hayamos mostrado la vieja por la demora (la próxima vez entra la nueva).
  // Este .then va antes que el de abajo: los clones se hacen antes de que la página empiece a leer la respuesta.
  // Si mostramos la vieja por la demora, también se bajan los archivos de la nueva: si no, la próxima apertura sin conexión
  // encontraría un index.html nuevo que nombra archivos que no están guardados (pantalla en blanco).
  e.waitUntil(fetched.then(
    res => {
      if (res.redirected || !C.cacheableDocument(res.status, res.type, res.headers.get('content-type'))) return undefined;
      const forAssets = timer.late && C.isAppShell(req.url) ? res.clone() : null;
      const saved = put(C.SHELL, key, res.clone());
      return forAssets ? saved.then(() => precacheAssets(forAssets)) : saved;
    },
    () => {},
  ));
  const net = fetched.then(res => ({ res }), err => ({ err }));
  const first = await Promise.race([net, timeout]);
  clearTimeout(timer.id);
  if (first === 'timeout') return cached;
  if (first.res && !(cached && C.isGatewayError(first.res.status))) return first.res;
  if (cached) return cached; // sin conexión (o servidor caído): la app (o la página ya visitada) que quedó guardada
  if (first.res) return first.res;
  throw first.err;
}

/** /assets/* (nombre con hash = contenido inmutable): el caché primero; si no está, red y se guarda. */
async function cacheFirst(e) {
  const req = e.request;
  const hit = await safe(async () => (await caches.open(C.ASSETS)).match(req));
  if (hit) return hit;
  const res = await fetch(req);
  if (C.cacheableAsset(res.status, res.type, res.headers.get('content-type'))) e.waitUntil(put(C.ASSETS, req, res.clone(), C.MAX_ASSETS));
  return res;
}

/** Íconos, manifest, imágenes: se sirve lo guardado y se actualiza de fondo. */
async function staleWhileRevalidate(e) {
  const req = e.request;
  const hit = await safe(async () => (await caches.open(C.STATIC)).match(req));
  const fresh = fetch(req).then(res => {
    if (res.status === 200 && res.type === 'basic') e.waitUntil(put(C.STATIC, req, res.clone()));
    return res;
  });
  if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
  return fresh;
}

/** Lectura de Supabase (GET a /rest/v1/): red primero; la copia guardada de ese usuario solo si la red falla. */
async function readData(e) {
  const req = e.request;
  const name = C.dataCacheName(req.headers.get('authorization')); // null: sin sesión (clave anónima) → no se guarda nada
  if (!name) return fetch(req);
  const key = C.dataKey(req.url, n => req.headers.get(n));
  const epoch = wipes;
  if (lastData !== name) {
    // Cambió la cuenta (o recién arranca): se borran los datos de cualquier otro usuario
    lastData = name;
    e.waitUntil(safe(async () => { for (const n of C.staleCaches(await caches.keys(), name)) await caches.delete(n); }));
  }
  const fromCache = async () => {
    const hit = await safe(() => caches.match(key, { cacheName: name })); // si no existe el caché, no lo crea
    if (!hit) return null;
    const headers = new Headers(hit.headers);
    headers.set('x-from-sw-cache', '1');
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
  };
  let res;
  try { res = await fetch(req); }
  catch (err) { const c = await fromCache(); if (c) return c; throw err; }
  if (C.isGatewayError(res.status)) { const c = await fromCache(); if (c) return c; return res; }
  // Lo que el servidor pidió que no se guarde (Cache-Control: no-store) no se guarda
  if (res.status === 200 && wipes === epoch && !C.noStore(res.headers.get('cache-control'))) {
    const copy = res.clone();
    // Si justo se cerró sesión mientras se guardaba, se borra lo recién guardado (el caché pudo crearse después del borrado)
    e.waitUntil(put(name, key, copy, C.MAX_DATA).then(() => (wipes === epoch ? undefined : safe(() => caches.delete(name)))));
  }
  return res;
}

// ---------- Avisos (push) ----------
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
