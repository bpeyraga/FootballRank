// Reportes de errores de la app (consola del panel): lógica pura y testeable, sin env ni red. La conexión con el navegador y con la
// base está en errors.ts. Todo lo que se junta se recorta y se limpia (sin mails ni tokens); el servidor lo vuelve a hacer.

export const MSG_MAX = 500;
export const STACK_MAX = 4000;
export const SOURCE_MAX = 300;
export const PATH_MAX = 80;
/** Tope de reportes por sesión (por pestaña abierta) y de repeticiones del mismo error. */
export const MAX_PER_SESSION = 10;
export const MAX_PER_ERROR = 3;

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

/** Saca lo que podría ser un dato personal: mails, tokens de sesión (JWT) y parámetros de login en URLs. */
export function scrub(s: string): string {
  return s
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, '[token]')
    .replace(/([?&#](?:access_token|refresh_token|provider_token|provider_refresh_token|code|token|apikey|api_key|key|email)=)[^&\s)'"]+/gi, '$1[x]')
    .replace(/(\/join\/)[\w-]+/gi, '$1[x]') // código de invitación: da acceso a una comunidad
    .replace(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g, '[email]');
}

/** El motivo de un error o de una promesa rechazada puede ser un Error, un texto, un objeto con `message` (como los de Supabase) o nada. */
export function describe(reason: unknown): { message: string; stack: string } {
  if (reason == null) return { message: '', stack: '' };
  if (typeof reason === 'string') return { message: reason.replace(/^Uncaught (?:\w+: )?/, ''), stack: '' };
  if (typeof reason === 'object') {
    const r = reason as { name?: unknown; message?: unknown; stack?: unknown };
    const msg = typeof r.message === 'string' ? r.message : '';
    const name = typeof r.name === 'string' ? r.name : '';
    const stack = typeof r.stack === 'string' ? r.stack : '';
    if (msg || name) {
      const withName = name && name !== 'Error' && !msg.startsWith(name) ? `${name}: ${msg}` : msg;
      return { message: withName || name, stack };
    }
    let json = '';
    try { json = JSON.stringify(reason); } catch { /* circular */ }
    return { message: json && json !== '{}' ? `Rechazo sin Error: ${json}` : '', stack };
  }
  return { message: String(reason), stack: '' };
}

/** "https://host/assets/Algo-AbCd1234.js?x=1", 12, 5 → "/assets/Algo-AbCd1234.js:12:5" (sin dominio ni query). */
export function shortSource(file: string | undefined, line?: number, col?: number): string {
  if (!file) return '';
  let p = file;
  try { p = new URL(file, 'http://x').pathname; } catch { p = file.split(/[?#]/)[0]; }
  return truncate(line ? `${p}:${line}${col ? `:${col}` : ''}` : p, SOURCE_MAX);
}

/** Ruta de la app donde pasó ("#/c/mi-grupo/chat"). El hash de vuelta del login (#access_token=…) y cualquier otra cosa → "#/".
 *  El código de una invitación ("#/join/ABC123") no se guarda: quien lo tiene entra a la comunidad. */
export function routePath(hash: string): string {
  if (!hash || !hash.startsWith('#/')) return '#/';
  if (/^#\/join(?:[/?#]|$)/i.test(hash)) return '#/join/:code';
  const p = hash.slice(1).split(/[?#]/)[0].replace(UUID, ':id');
  return truncate('#' + p, PATH_MAX);
}

/** Nombre del archivo de /assets/ del primer tramo de la pila que es de la app, sin el hash del build ("AdminPage-BqjD4ZX2.js" → "AdminPage.js"). */
export function appFrame(stack: string): string {
  const m = /\/assets\/([\w.-]+?)(?:-[\w-]{8})?\.(m?js):\d+:\d+/.exec(stack);
  return m ? `${m[1]}.${m[2]}` : '';
}

/** Mensaje sin lo que cambia de un caso a otro (ids, números largos, hashes, query de las URLs): sirve para agrupar. */
export function normalizeMessage(message: string): string {
  return scrub(message)
    .replace(/https?:\/\/[^\s)'"]+/g, u => u.split(/[?#]/)[0].replace(/-[\w-]{8}\.(m?js|css)$/, '.$1'))
    .replace(UUID, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<h>')
    .replace(/\d{4,}/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Huella de 16 caracteres hexa: el mismo error da siempre la misma, aunque cambien los números o el hash del build. */
export function fingerprint(message: string, stack: string): string {
  const key = `${normalizeMessage(message)}|${appFrame(stack)}`;
  return fnv(key, 0x811c9dc5) + fnv(key, 0x9e3779b1);
}

// ---------- Ruido: lo que no vale la pena avisar ----------
const RESIZE = /ResizeObserver loop/i;
const ABORT = /\b(?:AbortError|The (?:user|operation) aborted|The operation was aborted|aborted a request|signal is aborted|Fetch is aborted|Request aborted)\b/i;
const NETWORK = /^(?:TypeError: )?(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Network request failed)\b/i;
/** Cosas que inyectan navegadores internos (Instagram, WhatsApp, autocompletar) y extensiones; no son de la app. */
const JUNK = /_AutofillCallbackHandler|window\.webkit\.messageHandlers|Java object is gone|instantSearchSDKJSBridgeClearHighlight|__gCrWeb|Non-Error promise rejection captured|NavigatorLockAcquireTimeoutError|Lock "lock:sb-/i;
const EXTENSION = /(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;

/** True si toda la pila viene de scripts de otro origen (extensiones, inyectados por el navegador). Sin pila o sin URLs → false. */
export function foreignOnly(stack: string, origin: string): boolean {
  const urls = [...stack.matchAll(/(https?:\/\/[^\s)]+?):\d+:\d+/g)].map(m => m[1]);
  return urls.length > 0 && !urls.some(u => u.startsWith(origin));
}

export interface RawError { message: string; stack?: string; source?: string }
export interface Context { hash: string; online: boolean; origin: string }

/** ¿Es un error que no hay que reportar? `online` en false: los fallos de red (fetch) son esperables y no se avisan. */
export function isNoise(e: RawError, ctx: { online: boolean; origin?: string }): boolean {
  const m = (e.message || '').trim();
  const stack = e.stack || '';
  if (!m) return true;
  if (/^Script error\.?$/i.test(m)) return true; // error de otro origen: el navegador no da detalles
  if (RESIZE.test(m) || ABORT.test(m) || JUNK.test(m)) return true;
  if (!ctx.online && NETWORK.test(m)) return true;
  if (EXTENSION.test(`${stack} ${e.source ?? ''}`)) return true;
  if (ctx.origin && foreignOnly(stack, ctx.origin)) return true;
  return false;
}

export interface Report { message: string; stack: string; source: string; path: string; fp: string }

/** Arma el reporte listo para mandar (todo limpio y recortado), o null si es ruido o no tiene mensaje. */
export function buildReport(raw: RawError, ctx: Context): Report | null {
  const message = truncate(scrub(raw.message || '').replace(/\s+/g, ' ').trim(), MSG_MAX);
  const stack = truncate(scrub(raw.stack || '').trim(), STACK_MAX);
  if (isNoise({ message, stack: raw.stack, source: raw.source }, ctx)) return null;
  return { message, stack, source: truncate(scrub(raw.source || ''), SOURCE_MAX), path: routePath(ctx.hash), fp: fingerprint(message, stack) };
}

/** Tope en el navegador: como mucho `max` reportes por sesión y `perError` del mismo error. */
export function makeThrottle(max = MAX_PER_SESSION, perError = MAX_PER_ERROR) {
  let total = 0;
  const seen = new Map<string, number>();
  return {
    allow(fp: string): boolean {
      if (total >= max) return false;
      const n = seen.get(fp) ?? 0;
      if (n >= perError) return false;
      seen.set(fp, n + 1);
      total++;
      return true;
    },
  };
}

/** Une todo: limpia, filtra ruido, aplica el tope y manda. `send` nunca debería tirar, pero si tira se ignora. */
export function createReporter(deps: { send: (r: Report) => unknown; context: () => Context; max?: number; perError?: number }) {
  const throttle = makeThrottle(deps.max, deps.perError);
  return {
    /** true si se mandó. */
    report(raw: RawError): boolean {
      try {
        const r = buildReport(raw, deps.context());
        if (!r || !throttle.allow(r.fp)) return false;
        Promise.resolve(deps.send(r)).catch(() => {});
        return true;
      } catch { return false; }
    },
  };
}
