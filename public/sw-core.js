// Lógica pura del service worker (sin red ni caché): qué estrategia corresponde a cada pedido, cómo se nombran los cachés y
// cómo se ata lo guardado a cada usuario. Lo carga sw.js con importScripts y lo prueba src/app/sw.test.ts.
// Classic script (sin import/export): publica todo en self.SWCore.
(function (g) {
  // Subir V si cambia el formato de lo guardado: al activarse, el service worker borra los cachés de otras versiones.
  var V = 'v1';
  var PREFIX = 'fr-';
  var SHELL = PREFIX + 'shell-' + V; // index.html (y las páginas estáticas que se visitaron)
  var ASSETS = PREFIX + 'assets-' + V; // /assets/* con hash en el nombre: inmutables
  var STATIC = PREFIX + 'static-' + V; // íconos, manifest, imágenes sueltas
  var DATA_PREFIX = PREFIX + 'data-' + V + '-'; // + id del usuario: lecturas de Supabase (datos privados)

  /** Esperar a la red hasta acá antes de mostrar la copia guardada de la app (solo si hay copia). */
  var NAV_TIMEOUT_MS = 3000;
  /** Tope de entradas por caché (se borran las más viejas primero). */
  var MAX_ASSETS = 200;
  var MAX_DATA = 400;

  var STATIC_EXT = /\.(?:png|jpe?g|gif|webp|svg|ico|webmanifest|woff2?|ttf)$/i;

  function isSupabaseHost(h) { return /(^|\.)supabase\.co$/i.test(h); }

  /**
   * Qué hacer con un pedido: 'nav' (documento), 'asset' (/assets/*), 'static' (íconos/manifest), 'data' (lectura REST de Supabase)
   * o 'skip' (no lo toca el service worker: pasa directo a la red). Solo GET. Nunca auth, storage, edge functions ni escrituras.
   */
  function route(method, mode, url, origin) {
    if (String(method).toUpperCase() !== 'GET') return 'skip';
    var u;
    try { u = new URL(url); } catch (e) { return 'skip'; }
    if (u.origin !== origin) {
      // Solo las lecturas de PostgREST (tablas y RPC por GET) de Supabase; /auth, /storage, /functions, /realtime: directo a la red
      if (u.protocol === 'https:' && isSupabaseHost(u.hostname) && u.pathname.indexOf('/rest/v1/') === 0) return 'data';
      return 'skip';
    }
    var p = u.pathname;
    if (p === '/sw.js' || p === '/sw-core.js' || p.indexOf('/api/') === 0) return 'skip';
    if (mode === 'navigate') return 'nav';
    if (p.indexOf('/assets/') === 0) return 'asset';
    if (STATIC_EXT.test(p)) return 'static';
    return 'skip';
  }

  /** Clave con la que se guarda un documento: '/' e '/index.html' son la misma app (la ruta va en el #hash, nunca llega al servidor). */
  function shellKey(url) {
    var u = new URL(url);
    var p = u.pathname;
    return p === '/' || p === '/index.html' ? '/index.html' : p;
  }

  /** Solo el index.html tiene reemplazo cuando no hay conexión: otros documentos (legales) solo si ya se habían visitado. */
  function isAppShell(url) { return shellKey(url) === '/index.html'; }

  function b64urlToString(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    try { return decodeURIComponent(bin.split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')); }
    catch (e) { return bin; }
  }

  /** `sub` (id de usuario) del JWT de un header "Authorization: Bearer …". null si no es de un usuario con sesión (p. ej. la clave anon). */
  function jwtSub(authHeader) {
    if (!authHeader) return null;
    var m = /^Bearer\s+([\w-]+)\.([\w-]+)\.[\w-]*$/i.exec(String(authHeader).trim());
    if (!m) return null;
    try {
      var c = JSON.parse(b64urlToString(m[2]));
      var sub = c && typeof c.sub === 'string' ? c.sub : '';
      return /^[0-9a-f-]{8,64}$/i.test(sub) ? sub.toLowerCase() : null;
    } catch (e) { return null; }
  }

  /** Nombre del caché de datos de ese usuario, o null si no hay usuario (sin sesión no se guarda nada). */
  function dataCacheName(authHeader) {
    var s = jwtSub(authHeader);
    return s ? DATA_PREFIX + s : null;
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /**
   * URL con la que se guarda una lectura. PostgREST devuelve cosas distintas para el mismo URL según estos headers
   * (objeto vs. lista, conteo, rango, esquema), así que van en la clave. `get(name)` lee un header del pedido.
   */
  function dataKey(url, get) {
    var parts = ['accept', 'prefer', 'range', 'range-unit', 'accept-profile'].map(function (n) { return n + '=' + (get(n) || ''); }).join('|');
    var u = new URL(url);
    u.hash = '';
    u.searchParams.set('__fr', hash(parts));
    return u.href;
  }

  /** Respuestas del servidor caído o inalcanzable (no errores de la consulta): se trata como falta de red. */
  function isGatewayError(status) { return status === 502 || status === 503 || status === 504; }

  /** ¿Vale la pena guardar esta respuesta de un documento? Solo HTML correcto del propio sitio. */
  function cacheableDocument(status, type, contentType) {
    return status === 200 && type === 'basic' && /text\/html/i.test(contentType || '');
  }

  /** ¿El servidor pidió que no se guarde esta respuesta? (Cache-Control: no-store) */
  function noStore(cacheControl) { return /(^|[\s,])no-store\b/i.test(cacheControl || ''); }

  /** ¿Vale la pena guardar esta respuesta de /assets/*? Solo 200 que no sean HTML (un 404 con la página de la app no se guarda). */
  function cacheableAsset(status, type, contentType) {
    return status === 200 && type === 'basic' && !/text\/html/i.test(contentType || '');
  }

  /** Archivos de /assets/ que nombra un index.html (los precarga la instalación para que la app abra sin conexión). */
  function assetsIn(html) {
    var out = [];
    var re = /(?:src|href)="(\/assets\/[^"#?]+)"/g, m;
    while ((m = re.exec(html || ''))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  }

  /** Cachés propios que sobran: de otra versión, o de datos de un usuario que no es `keepUser` (cuando cambia la cuenta). */
  function staleCaches(names, keepDataName) {
    var keep = [SHELL, ASSETS, STATIC];
    return names.filter(function (n) {
      if (n.indexOf(PREFIX) !== 0) return false; // no es nuestro
      if (n.indexOf(DATA_PREFIX) === 0) return !!keepDataName && n !== keepDataName;
      return keep.indexOf(n) < 0;
    });
  }

  /** Todos los cachés de datos (al cerrar sesión). Incluye los de versiones viejas: ahí también hay datos privados. */
  function dataCaches(names) {
    return names.filter(function (n) { return /^fr-data-/.test(n); });
  }

  g.SWCore = {
    V: V, SHELL: SHELL, ASSETS: ASSETS, STATIC: STATIC, DATA_PREFIX: DATA_PREFIX,
    NAV_TIMEOUT_MS: NAV_TIMEOUT_MS, MAX_ASSETS: MAX_ASSETS, MAX_DATA: MAX_DATA,
    route: route, shellKey: shellKey, isAppShell: isAppShell, jwtSub: jwtSub, dataCacheName: dataCacheName, dataKey: dataKey,
    isGatewayError: isGatewayError, noStore: noStore, cacheableDocument: cacheableDocument, cacheableAsset: cacheableAsset,
    assetsIn: assetsIn, staleCaches: staleCaches, dataCaches: dataCaches,
  };
})(self);
