// Service worker (public/sw.js + public/sw-core.js): la decisión de qué estrategia usar y el comportamiento de cada una, con un
// caché y una red de mentira. Lo que no puede faltar: nada de datos privados sin sesión, nada de escrituras ni auth en el caché,
// los datos solo si falla la red, y todo se borra al cerrar sesión.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CORE = import.meta.glob<string>('../../public/sw-core.js', { query: '?raw', import: 'default', eager: true })['../../public/sw-core.js'];
const SW = import.meta.glob<string>('../../public/sw.js', { query: '?raw', import: 'default', eager: true })['../../public/sw.js'];

const ORIGIN = 'https://app.test';
const SB = 'https://abc.supabase.co';
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.firma`;
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const USER1 = jwt({ sub: U1, role: 'authenticated' });
const USER2 = jwt({ sub: U2, role: 'authenticated' });
const ANON = jwt({ role: 'anon', iss: 'supabase' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (): any => { const self: any = {}; new Function('self', CORE)(self); return self.SWCore; };
const core = load();

describe('sw-core: route()', () => {
  const r = (url: string, method = 'GET', mode = 'cors') => core.route(method, mode, url, ORIGIN);
  it('documentos de la app: red primero', () => {
    expect(r(`${ORIGIN}/`, 'GET', 'navigate')).toBe('nav');
    expect(r(`${ORIGIN}/?ref=1#/c/foo`, 'GET', 'navigate')).toBe('nav');
    expect(r(`${ORIGIN}/privacidad.html`, 'GET', 'navigate')).toBe('nav');
  });
  it('/assets/* con hash: caché primero; íconos y manifest: sirve lo guardado y actualiza', () => {
    expect(r(`${ORIGIN}/assets/index-zm8leCbP.js`)).toBe('asset');
    expect(r(`${ORIGIN}/assets/index-ByS-Ytg4.css`)).toBe('asset');
    expect(r(`${ORIGIN}/icon-192.png?v=2`)).toBe('static');
    expect(r(`${ORIGIN}/manifest.webmanifest`)).toBe('static');
    expect(r(`${ORIGIN}/og.jpg`)).toBe('static');
  });
  it('lecturas REST de Supabase (GET): datos; todo lo demás de Supabase, directo a la red', () => {
    expect(r(`${SB}/rest/v1/matches?select=*&id=eq.1`)).toBe('data');
    expect(r(`${SB}/rest/v1/rpc/my_bookings?x=1`)).toBe('data');
    expect(r(`${SB}/auth/v1/user`)).toBe('skip');
    expect(r(`${SB}/auth/v1/token?grant_type=refresh_token`)).toBe('skip');
    expect(r(`${SB}/storage/v1/object/avatars/a.png`)).toBe('skip');
    expect(r(`${SB}/storage/v1/object/public/chat/x.jpg`)).toBe('skip');
    expect(r(`${SB}/functions/v1/place`)).toBe('skip');
    expect(r(`${SB}/realtime/v1/websocket`)).toBe('skip');
    expect(r('http://abc.supabase.co/rest/v1/matches')).toBe('skip'); // sin https
  });
  it('escrituras y otros métodos: nunca', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
      expect(r(`${SB}/rest/v1/matches`, m)).toBe('skip');
      expect(r(`${SB}/rest/v1/rpc/vote_poll`, m)).toBe('skip');
      expect(r(`${ORIGIN}/assets/x-abcdefgh.js`, m)).toBe('skip');
    }
  });
  it('otros orígenes, /api y el propio service worker: directo a la red', () => {
    expect(r('https://fonts.googleapis.com/css2?family=Barlow')).toBe('skip');
    expect(r('https://fonts.gstatic.com/s/barlow/x.woff2')).toBe('skip');
    expect(r('https://nominatim.openstreetmap.org/search?q=a')).toBe('skip');
    expect(r('https://evilsupabase.co/rest/v1/x')).toBe('skip');
    expect(r('https://supabase.co.evil.com/rest/v1/x')).toBe('skip');
    expect(r(`${ORIGIN}/api/keepalive`)).toBe('skip');
    expect(r(`${ORIGIN}/sw.js`)).toBe('skip');
    expect(r(`${ORIGIN}/sw-core.js`)).toBe('skip');
    expect(r(`${ORIGIN}/robots.txt`)).toBe('skip');
    expect(r('no es una url')).toBe('skip');
  });
});

describe('sw-core: usuario, claves y limpieza', () => {
  it('jwtSub: solo tokens de usuario con sesión', () => {
    expect(core.jwtSub(`Bearer ${USER1}`)).toBe(U1);
    expect(core.jwtSub(`bearer ${USER2}`)).toBe(U2);
    expect(core.jwtSub(`Bearer ${ANON}`)).toBeNull(); // clave anon: sin usuario
    expect(core.jwtSub(null)).toBeNull();
    expect(core.jwtSub('Bearer basura')).toBeNull();
    expect(core.jwtSub(`Bearer ${jwt({ sub: '../../etc' })}`)).toBeNull();
  });
  it('dataCacheName: uno por usuario; sin usuario no hay caché', () => {
    expect(core.dataCacheName(`Bearer ${USER1}`)).toBe(`fr-data-v1-${U1}`);
    expect(core.dataCacheName(`Bearer ${USER1}`)).not.toBe(core.dataCacheName(`Bearer ${USER2}`));
    expect(core.dataCacheName(`Bearer ${ANON}`)).toBeNull();
  });
  it('dataKey: el mismo URL con distinto Accept/Prefer/Range es otra clave (objeto vs. lista, conteos)', () => {
    const k = (h: Record<string, string>) => core.dataKey(`${SB}/rest/v1/p?select=*&id=eq.1`, (n: string) => h[n] ?? '');
    expect(k({})).toBe(k({}));
    expect(k({ accept: 'application/vnd.pgrst.object+json' })).not.toBe(k({}));
    expect(k({ prefer: 'count=exact' })).not.toBe(k({}));
    expect(k({ range: '0-9' })).not.toBe(k({ range: '10-19' }));
    expect(k({})).toContain('/rest/v1/p?select=*&id=eq.1&__fr=');
  });
  it('shellKey: "/" e "/index.html" son la misma app; el #hash no cuenta', () => {
    expect(core.shellKey(`${ORIGIN}/`)).toBe('/index.html');
    expect(core.shellKey(`${ORIGIN}/index.html?x=1`)).toBe('/index.html');
    expect(core.shellKey(`${ORIGIN}/cookies.html`)).toBe('/cookies.html');
    expect(core.isAppShell(`${ORIGIN}/?utm=a`)).toBe(true);
    expect(core.isAppShell(`${ORIGIN}/terminos.html`)).toBe(false);
  });
  it('qué se guarda: documento HTML ok, asset que no sea HTML, nunca errores', () => {
    expect(core.cacheableDocument(200, 'basic', 'text/html; charset=utf-8')).toBe(true);
    expect(core.cacheableDocument(404, 'basic', 'text/html')).toBe(false);
    expect(core.cacheableDocument(200, 'opaque', 'text/html')).toBe(false);
    expect(core.cacheableAsset(200, 'basic', 'text/javascript')).toBe(true);
    expect(core.cacheableAsset(200, 'basic', 'text/html')).toBe(false); // un 404 disfrazado de página
    expect(core.cacheableAsset(404, 'basic', 'text/javascript')).toBe(false);
    expect(core.isGatewayError(503)).toBe(true);
    expect(core.isGatewayError(500)).toBe(false);
    expect(core.isGatewayError(401)).toBe(false);
    expect(core.noStore('private, no-store')).toBe(true);
    expect(core.noStore('NO-STORE')).toBe(true);
    expect(core.noStore('public, max-age=0')).toBe(false);
    expect(core.noStore(null)).toBe(false);
  });
  it('assetsIn: los archivos que nombra el index.html', () => {
    const html = '<script type="module" crossorigin src="/assets/index-zm8leCbP.js"></script><link rel="stylesheet" href="/assets/index-ByS-Ytg4.css"><link href="/icon.png?v=2"><script src="/assets/index-zm8leCbP.js">';
    expect(core.assetsIn(html)).toEqual(['/assets/index-zm8leCbP.js', '/assets/index-ByS-Ytg4.css']);
    expect(core.assetsIn('')).toEqual([]);
  });
  it('staleCaches: borra versiones viejas y datos de otros usuarios; no toca lo ajeno; dataCaches: todos los de datos', () => {
    const names = ['fr-shell-v1', 'fr-shell-v0', 'fr-assets-v1', 'fr-static-v0', `fr-data-v1-${U1}`, `fr-data-v1-${U2}`, 'fr-data-v0-x', 'workbox-precache', 'otra-cosa'];
    expect(core.staleCaches(names, null).sort()).toEqual(['fr-data-v0-x', 'fr-shell-v0', 'fr-static-v0'].sort());
    expect(core.staleCaches(names, `fr-data-v1-${U1}`).sort()).toEqual(['fr-data-v0-x', `fr-data-v1-${U2}`, 'fr-shell-v0', 'fr-static-v0'].sort());
    expect(core.dataCaches(names).sort()).toEqual([`fr-data-v1-${U1}`, `fr-data-v1-${U2}`, 'fr-data-v0-x'].sort());
  });
});

// ---------- sw.js completo, con un navegador de mentira ----------
type Handler = (e: any) => void;
const keyOf = (r: any): string => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const norm = (r: any) => { const k = keyOf(r); return k.startsWith(ORIGIN) ? k.slice(ORIGIN.length) || '/' : k; };
  const store = (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name)!; };
  const cache = (name: string) => ({
    match: async (r: any) => stores.get(name)?.get(norm(r))?.clone(),
    put: async (r: any, res: Response) => { store(name).set(norm(r), res); },
    keys: async () => [...(stores.get(name)?.keys() ?? [])].map(url => ({ url })),
    delete: async (r: any) => stores.get(name)?.delete(typeof r === 'string' ? norm(r) : norm(r.url)) ?? false,
  });
  return {
    stores, norm,
    api: {
      open: async (name: string) => { store(name); return cache(name); },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (r: any, o?: { cacheName?: string }) => (o?.cacheName ? stores.get(o.cacheName)?.get(norm(r))?.clone() : undefined),
    },
  };
}

const res = (body: string, init: ResponseInit & { type?: string } = {}) => {
  const r = new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
  Object.defineProperty(r, 'type', { value: init.type ?? 'basic' });
  return r;
};
const json = (o: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function setup() {
  const c = fakeCaches();
  const handlers: Record<string, Handler> = {};
  const net = { calls: [] as string[], impl: async (_: any): Promise<Response> => { throw new TypeError('Failed to fetch'); } };
  const self: any = {
    addEventListener: (t: string, h: Handler) => { handlers[t] = h; },
    skipWaiting: vi.fn(), location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    registration: { navigationPreload: { enable: vi.fn(async () => {}) } },
  };
  const importScripts = () => { new Function('self', CORE)(self); };
  const fetchFn = (r: any) => { net.calls.push(keyOf(r)); return net.impl(r); };
  new Function('self', 'importScripts', 'caches', 'fetch', SW)(self, importScripts, c.api, fetchFn);

  /** Dispara un evento y deja esperar todo lo que el service worker puso en waitUntil. */
  const ev = (extra: any) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const e = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, respondWith: (p: Promise<Response>) => { responded = p; }, preloadResponse: Promise.resolve(undefined), ...extra };
    return { e, responded: () => responded, settle: async () => { await Promise.all(waits); } };
  };
  const request = (url: string, o: { method?: string; mode?: string; auth?: string } = {}) =>
    ({ url, method: o.method ?? 'GET', mode: o.mode ?? 'cors', headers: new Headers(o.auth ? { authorization: `Bearer ${o.auth}` } : {}) });
  const fetchEvent = async (req: any) => {
    const f = ev({ request: req });
    handlers.fetch(f.e);
    const out = await f.responded()!;
    return { out, settle: f.settle };
  };
  const has = (name: string, url: string) => c.stores.get(name)?.has(c.norm(url)) ?? false;
  const text = (name: string, url: string) => c.stores.get(name)!.get(c.norm(url))!.clone().text();
  const dataCaches = () => [...c.stores.keys()].filter(k => k.startsWith('fr-data-'));
  return { c, handlers, net, self, ev, request, fetchEvent, has, text, dataCaches };
}

describe('sw.js', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });
  afterEach(() => { vi.useRealTimers(); });

  it('install: deja la app lista para abrir sin conexión (documento y sus archivos)', async () => {
    t.net.impl = async r => {
      if (keyOf(r).endsWith('/assets/index-aaaaaaaa.js')) return res('js', { headers: { 'content-type': 'text/javascript' } });
      return res('<script src="/assets/index-aaaaaaaa.js"></script>');
    };
    const f = t.ev({});
    t.handlers.install(f.e);
    await f.settle();
    expect(t.self.skipWaiting).toHaveBeenCalled();
    expect(t.has('fr-shell-v1', '/index.html')).toBe(true);
    expect(t.has('fr-assets-v1', '/assets/index-aaaaaaaa.js')).toBe(true);
  });

  it('install: si falla la red igual se instala (los avisos push no dependen de esto)', async () => {
    const f = t.ev({});
    t.handlers.install(f.e);
    await expect(f.settle()).resolves.toBeUndefined();
  });

  it('activate: borra cachés de versiones viejas y reclama las pestañas; no toca los ajenos', async () => {
    await t.c.api.open('fr-shell-v0'); await t.c.api.open('fr-shell-v1'); await t.c.api.open('ajeno');
    const f = t.ev({});
    t.handlers.activate(f.e);
    await f.settle();
    expect([...t.c.stores.keys()].sort()).toEqual(['ajeno', 'fr-shell-v1']);
    expect(t.self.clients.claim).toHaveBeenCalled();
    expect(t.self.registration.navigationPreload.enable).toHaveBeenCalled();
  });

  describe('documentos', () => {
    const nav = (p = '/') => t.request(`${ORIGIN}${p}`, { mode: 'navigate' });

    it('con red: siempre la versión nueva, y la guarda', async () => {
      t.net.impl = async () => res('<html>v2</html>');
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>v1</html>'));
      const r = await t.fetchEvent(nav());
      expect(await r.out.text()).toBe('<html>v2</html>');
      await r.settle();
      expect(await t.text('fr-shell-v1', '/index.html')).toBe('<html>v2</html>');
    });

    it('sin conexión: la copia guardada', async () => {
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>guardada</html>'));
      const r = await t.fetchEvent(nav('/?ref=x'));
      expect(await r.out.text()).toBe('<html>guardada</html>');
    });

    it('sin conexión y sin copia: falla como siempre (no inventa nada)', async () => {
      const f = t.ev({ request: nav() });
      t.handlers.fetch(f.e);
      await expect(f.responded()!).rejects.toThrow('Failed to fetch');
    });

    it('red lenta (más de 3 s) y hay copia: muestra la copia, y la versión nueva queda guardada para la próxima', async () => {
      vi.useFakeTimers();
      let release!: (r: Response) => void;
      t.net.impl = () => new Promise<Response>(ok => { release = ok; });
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>vieja</html>'));
      const f = t.ev({ request: nav() });
      t.handlers.fetch(f.e);
      let done = false;
      f.responded()!.then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(2900);
      expect(done).toBe(false); // todavía espera a la red
      await vi.advanceTimersByTimeAsync(200);
      expect(await (await f.responded()!).text()).toBe('<html>vieja</html>');
      release(res('<html>nueva</html>'));
      await f.settle();
      expect(await t.text('fr-shell-v1', '/index.html')).toBe('<html>nueva</html>');
    });

    it('red lenta (más de 3 s): además de la copia nueva se guardan sus archivos, para que abra sin conexión la próxima vez', async () => {
      vi.useFakeTimers();
      let release!: (r: Response) => void;
      t.net.impl = async r => {
        if (keyOf(r).includes('/assets/')) return res('js', { headers: { 'content-type': 'text/javascript' } });
        return new Promise<Response>(ok => { release = ok; });
      };
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>vieja</html>'));
      const f = t.ev({ request: nav() });
      t.handlers.fetch(f.e);
      await vi.advanceTimersByTimeAsync(3100);
      await f.responded();
      release(res('<script src="/assets/index-nuevo0001.js"></script>'));
      await f.settle();
      expect(t.has('fr-assets-v1', '/assets/index-nuevo0001.js')).toBe(true);
    });

    it('con red (sin demora) no baja los archivos por su cuenta: los pide la propia página', async () => {
      t.net.impl = async () => res('<script src="/assets/index-nuevo0002.js"></script>');
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>vieja</html>'));
      const r = await t.fetchEvent(nav());
      await r.settle();
      expect(t.net.calls.some(u => u.includes('/assets/'))).toBe(false);
    });

    it('red lenta pero sin copia: espera a la red (no hay con qué reemplazarla)', async () => {
      vi.useFakeTimers();
      let release!: (r: Response) => void;
      t.net.impl = () => new Promise<Response>(ok => { release = ok; });
      const f = t.ev({ request: nav() });
      t.handlers.fetch(f.e);
      await vi.advanceTimersByTimeAsync(10_000);
      release(res('<html>recién llegó</html>'));
      expect(await (await f.responded()!).text()).toBe('<html>recién llegó</html>');
    });

    it('servidor caído (503) con copia: la copia; no guarda el error', async () => {
      t.net.impl = async () => res('mantenimiento', { status: 503 });
      await (await t.c.api.open('fr-shell-v1')).put('/index.html', res('<html>guardada</html>'));
      const r = await t.fetchEvent(nav());
      expect(await r.out.text()).toBe('<html>guardada</html>');
      await r.settle();
      expect(await t.text('fr-shell-v1', '/index.html')).toBe('<html>guardada</html>');
    });

    it('una política ya visitada se ve sin conexión; una nunca visitada no (no se reemplaza por la app)', async () => {
      await (await t.c.api.open('fr-shell-v1')).put('/privacidad.html', res('<html>priv</html>'));
      const ok = await t.fetchEvent(nav('/privacidad.html'));
      expect(await ok.out.text()).toBe('<html>priv</html>');
      const f = t.ev({ request: nav('/terminos.html') });
      t.handlers.fetch(f.e);
      await expect(f.responded()!).rejects.toThrow();
    });
  });

  describe('/assets/* e íconos', () => {
    it('assets: primero el caché; solo va a la red la primera vez', async () => {
      t.net.impl = async () => res('console.log(1)', { headers: { 'content-type': 'text/javascript' } });
      const url = `${ORIGIN}/assets/Page-abcdefgh.js`;
      const a = await t.fetchEvent(t.request(url));
      expect(await a.out.text()).toBe('console.log(1)');
      await a.settle();
      expect(t.has('fr-assets-v1', url)).toBe(true);
      t.net.impl = async () => { throw new TypeError('sin red'); };
      const b = await t.fetchEvent(t.request(url));
      expect(await b.out.text()).toBe('console.log(1)');
      expect(t.net.calls.filter(u => u === url)).toHaveLength(1);
    });

    it('un asset que ya no existe (404, o la página de la app) no se guarda: el aviso de "recargar" sigue funcionando', async () => {
      const url = `${ORIGIN}/assets/Viejo-abcdefgh.js`;
      t.net.impl = async () => res('no existe', { status: 404, headers: { 'content-type': 'text/plain' } });
      const a = await t.fetchEvent(t.request(url));
      expect(a.out.status).toBe(404);
      await a.settle();
      t.net.impl = async () => res('<html>app</html>'); // SPA fallback
      const b = await t.fetchEvent(t.request(url));
      await b.settle();
      expect(t.has('fr-assets-v1', url)).toBe(false);
    });

    it('íconos: sale lo guardado y se actualiza de fondo', async () => {
      const url = `${ORIGIN}/icon-192.png?v=2`;
      await (await t.c.api.open('fr-static-v1')).put(url, res('viejo', { headers: { 'content-type': 'image/png' } }));
      t.net.impl = async () => res('nuevo', { headers: { 'content-type': 'image/png' } });
      const r = await t.fetchEvent(t.request(url));
      expect(await r.out.text()).toBe('viejo');
      await r.settle();
      expect(await t.text('fr-static-v1', url)).toBe('nuevo');
    });
  });

  describe('lecturas de Supabase', () => {
    const URL1 = `${SB}/rest/v1/matches?select=*&community_id=eq.7`;

    it('con red: devuelve lo del servidor (nunca el caché) y lo guarda para ese usuario', async () => {
      t.net.impl = async () => json([{ id: 1 }]);
      const a = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      expect(await a.out.json()).toEqual([{ id: 1 }]);
      await a.settle();
      expect(t.dataCaches()).toEqual([`fr-data-v1-${U1}`]);
      t.net.impl = async () => json([{ id: 1 }, { id: 2 }]); // el servidor cambió: se ve lo nuevo
      const b = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      expect(await b.out.json()).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('sin red: la última copia de ese usuario, marcada; sin copia, el error de red', async () => {
      t.net.impl = async () => json([{ id: 1 }], { headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } });
      const a = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      await a.settle();
      t.net.impl = async () => { throw new TypeError('Failed to fetch'); };
      const b = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      expect(await b.out.json()).toEqual([{ id: 1 }]);
      expect(b.out.headers.get('x-from-sw-cache')).toBe('1');
      expect(b.out.headers.get('content-range')).toBe('0-0/1'); // supabase-js lee los conteos de acá
      const f = t.ev({ request: t.request(`${SB}/rest/v1/otra?x=1`, { auth: USER1 }) });
      t.handlers.fetch(f.e);
      await expect(f.responded()!).rejects.toThrow('Failed to fetch');
    });

    it('un error de la consulta (401/500) se muestra tal cual, no se tapa con una copia vieja; 502/503/504 sí (es la red)', async () => {
      t.net.impl = async () => json([{ id: 1 }]);
      await (await t.fetchEvent(t.request(URL1, { auth: USER1 }))).settle();
      t.net.impl = async () => json({ message: 'JWT expired' }, { status: 401 });
      expect((await t.fetchEvent(t.request(URL1, { auth: USER1 }))).out.status).toBe(401);
      t.net.impl = async () => json({ message: 'boom' }, { status: 500 });
      expect((await t.fetchEvent(t.request(URL1, { auth: USER1 }))).out.status).toBe(500);
      t.net.impl = async () => new Response('bad gateway', { status: 502 });
      const g = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      expect(g.out.status).toBe(200);
      expect(await g.out.json()).toEqual([{ id: 1 }]);
    });

    it('si el servidor pide Cache-Control: no-store, no se guarda', async () => {
      t.net.impl = async () => json([{ id: 1 }], { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
      const a = await t.fetchEvent(t.request(URL1, { auth: USER1 }));
      await a.settle();
      expect(t.dataCaches()).toEqual([]);
    });

    it('cada usuario ve solo lo suyo; si cambia la cuenta se borra lo del anterior', async () => {
      t.net.impl = async () => json([{ de: 'usuario 1' }]);
      await (await t.fetchEvent(t.request(URL1, { auth: USER1 }))).settle();
      t.net.impl = async () => { throw new TypeError('sin red'); };
      const f = t.ev({ request: t.request(URL1, { auth: USER2 }) });
      t.handlers.fetch(f.e);
      await expect(f.responded()!).rejects.toThrow(); // el usuario 2 no recibe lo del 1
      await f.settle();
      expect(t.c.stores.has(`fr-data-v1-${U1}`)).toBe(false); // y lo del 1 se borró al aparecer el 2
    });

    it('sin sesión (clave anónima): no se guarda nada', async () => {
      t.net.impl = async () => json([{ publico: true }]);
      const a = await t.fetchEvent(t.request(URL1, { auth: ANON }));
      expect(await a.out.json()).toEqual([{ publico: true }]);
      await a.settle();
      expect(t.dataCaches()).toEqual([]);
      const b = await t.fetchEvent(t.request(URL1)); // ni siquiera Authorization
      await b.settle();
      expect(t.dataCaches()).toEqual([]);
    });

    it('cerrar sesión borra todas las lecturas guardadas, y una lectura que estaba en vuelo no se guarda después', async () => {
      t.net.impl = async () => json([{ id: 1 }]);
      await (await t.fetchEvent(t.request(URL1, { auth: USER1 }))).settle();
      await t.c.api.open('fr-data-v0-viejo');
      expect(t.dataCaches()).toHaveLength(2);
      // una lectura sale ANTES de cerrar sesión y llega DESPUÉS
      let release!: (r: Response) => void;
      t.net.impl = () => new Promise<Response>(ok => { release = ok; });
      const inflight = t.ev({ request: t.request(`${SB}/rest/v1/chat?x=1`, { auth: USER1 }) });
      t.handlers.fetch(inflight.e);
      await Promise.resolve();
      const msg = t.ev({ data: { type: 'fr-clear-data' } });
      t.handlers.message(msg.e);
      await msg.settle();
      expect(t.dataCaches()).toEqual([]);
      release(json([{ privado: 1 }]));
      await inflight.responded();
      await inflight.settle();
      expect(t.dataCaches()).toEqual([]);
      // las pantallas (sin datos personales) se quedan
      await t.c.api.open('fr-shell-v1');
      const m2 = t.ev({ data: { type: 'fr-clear-data' } });
      t.handlers.message(m2.e);
      await m2.settle();
      expect(t.c.stores.has('fr-shell-v1')).toBe(true);
    });
  });

  describe('lo que no se toca', () => {
    it.each([
      ['escritura (POST) a REST', `${SB}/rest/v1/rpc/vote_poll`, 'POST', 'cors'],
      ['PATCH a una tabla', `${SB}/rest/v1/matches?id=eq.1`, 'PATCH', 'cors'],
      ['login', `${SB}/auth/v1/token?grant_type=password`, 'POST', 'cors'],
      ['sesión', `${SB}/auth/v1/user`, 'GET', 'cors'],
      ['subida a storage', `${SB}/storage/v1/object/chat/a.jpg`, 'POST', 'cors'],
      ['lectura de storage', `${SB}/storage/v1/object/public/avatars/a.png`, 'GET', 'no-cors'],
      ['edge function', `${SB}/functions/v1/place`, 'POST', 'cors'],
      ['tipografías de Google', 'https://fonts.googleapis.com/css2?family=Barlow', 'GET', 'no-cors'],
      ['API propia', `${ORIGIN}/api/keepalive`, 'GET', 'cors'],
    ])('%s pasa directo a la red (sin respondWith)', (_n, url, method, mode) => {
      const f = t.ev({ request: t.request(url, { method, mode, auth: USER1 }) });
      t.handlers.fetch(f.e);
      expect(f.responded()).toBeUndefined();
    });
  });

  it('push y clic en el aviso siguen registrados', () => {
    expect(typeof t.handlers.push).toBe('function');
    expect(typeof t.handlers.notificationclick).toBe('function');
  });
});
