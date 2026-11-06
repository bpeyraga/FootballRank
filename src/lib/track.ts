import { sb } from './supabase';
import { platformOf, routeKey } from './adminCore';

/**
 * Métricas de uso para el panel de la app: un id anónimo por navegador, un "latido" cada 60 s mientras la pestaña
 * se ve y el aviso de instalación. Nunca rompe la app: todos los errores se tragan. En localhost no hace nada.
 */
const VID_KEY = 'fr-vid';
const BEAT_MS = 60_000;
const MIN_GAP_MS = 30_000; // nunca más de un pedido cada 30 s

let client: typeof sb | null = null;
let vid = '';
let lastAt = 0;
let pending: ReturnType<typeof setTimeout> | undefined;

function uuid(): string {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* contexto no seguro */ }
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** El id queda en localStorage; sin storage (modo privado) vive en memoria hasta cerrar la pestaña. */
function visitorId(): string {
  try {
    const v = localStorage.getItem(VID_KEY);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return v;
    const n = uuid();
    localStorage.setItem(VID_KEY, n);
    return n;
  } catch { return uuid(); }
}

const isStandalone = () => {
  try { return matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true; } catch { return false; }
};
const platform = () => platformOf(navigator.userAgent, navigator.maxTouchPoints || 0);

async function send(fn: 'track_visit' | 'track_install', args: Record<string, unknown>) {
  try { await client?.rpc(fn, args); } catch { /* silencioso */ }
}

/** Latido con tope: si se pidió antes de tiempo, queda uno solo agendado para cuando se cumplan los 30 s. */
function ping() {
  if (!client) return;
  const wait = MIN_GAP_MS - (Date.now() - lastAt);
  if (wait > 0) {
    if (!pending) pending = setTimeout(() => { pending = undefined; ping(); }, wait + 50);
    return;
  }
  lastAt = Date.now();
  void send('track_visit', { p_vid: vid, p_standalone: isStandalone(), p_platform: platform(), p_path: routeKey(location.hash) });
}

/** Avisa ahora (p. ej. al iniciar sesión, para asociar la visita al usuario). Respeta el tope de 30 s. */
export function trackNow() { try { ping(); } catch { /* silencioso */ } }

export function startTracking(c: typeof sb = sb) {
  try {
    if (client || typeof window === 'undefined') return;
    if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) return;
    client = c;
    vid = visitorId();
    ping();
    setInterval(() => { if (document.visibilityState === 'visible') ping(); }, BEAT_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ping(); });
    addEventListener('appinstalled', () => { void send('track_install', { p_vid: vid, p_platform: platform() }); });
  } catch { /* silencioso */ }
}
