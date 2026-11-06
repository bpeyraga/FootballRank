// Clima del partido: pronóstico de Open-Meteo (sin API key) a la hora del partido. Todo falla en silencio.
// Las partes puras (código WMO, hora del partido, textos, caché) se testean sin red ni navegador.

export const FORECAST_TZ = 'America/Argentina/Buenos_Aires';
export const WX_TTL = 30 * 60e3; // el pronóstico se guarda 30 minutos por cancha y hora
const DAY = 864e5;

export interface Weather { code: number; temp: number; rain: number | null; wind: number | null }

/** Emoji y descripción de un código WMO (weathercode de Open-Meteo). */
export function wmo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Despejado' };
  if (code === 1) return { emoji: '🌤️', label: 'Mayormente despejado' };
  if (code === 2) return { emoji: '⛅', label: 'Parcialmente nublado' };
  if (code === 3) return { emoji: '☁️', label: 'Nublado' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Niebla' };
  if (code >= 51 && code <= 55) return { emoji: '🌦️', label: 'Llovizna' };
  if (code === 56 || code === 57) return { emoji: '🌧️', label: 'Llovizna helada' };
  if (code === 61) return { emoji: '🌦️', label: 'Lluvia leve' };
  if (code === 63) return { emoji: '🌧️', label: 'Lluvia' };
  if (code === 65) return { emoji: '🌧️', label: 'Lluvia fuerte' };
  if (code === 66 || code === 67) return { emoji: '🌧️', label: 'Lluvia helada' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Nieve' };
  if (code === 80 || code === 81) return { emoji: '🌦️', label: 'Chaparrones' };
  if (code === 82) return { emoji: '🌧️', label: 'Chaparrones fuertes' };
  if (code === 85 || code === 86) return { emoji: '🌨️', label: 'Nevadas' };
  if (code === 95) return { emoji: '⛈️', label: 'Tormenta' };
  if (code === 96 || code === 99) return { emoji: '⛈️', label: 'Tormenta con granizo' };
  return { emoji: '🌡️', label: 'Clima' };
}

/** "18° · 20% lluvia · viento 12 km/h" (lo que falte se omite). */
export function weatherText(w: Weather): string {
  return [
    `${Math.round(w.temp)}°`,
    w.rain != null ? `${Math.round(w.rain)}% lluvia` : null,
    w.wind != null ? `viento ${Math.round(w.wind)} km/h` : null,
  ].filter(Boolean).join(' · ');
}

/** ¿El partido cae en la ventana del pronóstico? Desde que empezó hace menos de 3 h hasta 7 días adelante. */
export function inForecastWindow(startsAt: string, now = Date.now()): boolean {
  const t = +new Date(startsAt);
  return Number.isFinite(t) && t > now - 3 * 3600e3 && t <= now + 7 * DAY;
}

/** La URL de Open-Meteo: 8 días de pronóstico por hora, en hora de Buenos Aires. */
export function forecastUrl(lat: number, lng: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
    + '&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m'
    + `&timezone=${encodeURIComponent(FORECAST_TZ)}&forecast_days=8`;
}

/** "2026-11-12T21:00": la hora (en punto) del instante, en la zona del pronóstico: así vienen los `hourly.time`. */
export function hourKey(iso: string, tz = FORECAST_TZ): string | null {
  const d = new Date(iso);
  if (isNaN(+d)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:00`;
  } catch { // sin Intl con zonas: Argentina no tiene horario de verano, es UTC-3 todo el año
    return new Date(+d - 3 * 3600e3).toISOString().slice(0, 13) + ':00';
  }
}

/** El clima de esa hora dentro de la respuesta de Open-Meteo (`hourly`), o null si no está o viene incompleto. */
export function pickHour(hourly: any, key: string): Weather | null {
  const i = Array.isArray(hourly?.time) ? hourly.time.indexOf(key) : -1;
  if (i < 0) return null;
  const num = (a: any): number | null => (Array.isArray(a) && typeof a[i] === 'number' && Number.isFinite(a[i]) ? a[i] : null);
  const temp = num(hourly.temperature_2m), code = num(hourly.weathercode);
  if (temp == null || code == null) return null;
  return { code, temp, rain: num(hourly.precipitation_probability), wind: num(hourly.windspeed_10m) };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
export const cacheKey = (lat: number, lng: number, hour: string) => `wx1:${lat.toFixed(3)},${lng.toFixed(3)}:${hour}`;

export function readCache(store: Store | null, key: string, now = Date.now()): Weather | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const { t, w } = JSON.parse(raw);
    return typeof t === 'number' && now - t >= 0 && now - t < WX_TTL && typeof w?.temp === 'number' && typeof w?.code === 'number' ? w : null;
  } catch { return null; }
}
export function writeCache(store: Store | null, key: string, w: Weather, now = Date.now()) {
  try { store?.setItem(key, JSON.stringify({ t: now, w })); } catch { /* sin storage o lleno */ }
}

const session = (): Store | null => { try { return sessionStorage; } catch { return null; } };

/** Pronóstico a la hora del partido (con caché de 30 min por cancha y hora). Devuelve null ante cualquier problema. */
export async function loadWeather(lat: number, lng: number, startsAt: string,
  deps: { fetch?: typeof fetch; storage?: Store | null; now?: number } = {}): Promise<Weather | null> {
  try {
    const now = deps.now ?? Date.now();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inForecastWindow(startsAt, now)) return null;
    const hour = hourKey(startsAt);
    if (!hour) return null;
    const store = deps.storage === undefined ? session() : deps.storage;
    const key = cacheKey(lat, lng, hour);
    const hit = readCache(store, key, now);
    if (hit) return hit;
    const f = deps.fetch ?? fetch;
    const r = await f(forecastUrl(lat, lng), { signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(8000) : undefined });
    if (!r.ok) return null;
    const w = pickHour((await r.json())?.hourly, hour);
    if (w) writeCache(store, key, w, now);
    return w;
  } catch { return null; }
}
