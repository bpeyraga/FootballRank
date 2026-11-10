// Lugares y ubicación: búsqueda de barrios (Open-Meteo, igual que el clima: sin API key), nombre del barrio a partir de
// una ubicación (OpenStreetMap/Nominatim) y la ubicación del navegador. Nada de esto toca Supabase.
// Las partes puras (parsePlaces, labelFromReverse, redondeo) están en model.ts y se testean sin red.
import { UNNAMED_ZONE, labelFromReverse, parsePlaces, roundCoord, type Place } from './model';

/** País fijo: la app es de fútbol argentino. (El parámetro de Open-Meteo es `countryCode`; `country` lo ignora.) */
export const geocodeUrl = (q: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=es&countryCode=AR`;

/** Reverse geocoding con coordenadas que ya vienen redondeadas (~1 km): ni a un tercero le llega la ubicación exacta. */
export const reverseUrl = (lat: number, lng: number) =>
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=14&addressdetails=1&accept-language=es`;

interface Deps { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number }

const withTimeout = (signal: AbortSignal | undefined, ms: number): AbortSignal | undefined => {
  if (typeof AbortSignal === 'undefined' || !('timeout' in AbortSignal)) return signal;
  const t = AbortSignal.timeout(ms);
  return signal && 'any' in AbortSignal ? (AbortSignal as any).any([signal, t]) : signal ?? t;
};

/** Barrios y ciudades que coinciden con lo escrito. Tira Error si no hay conexión (la pantalla avisa). */
export async function searchPlaces(q: string, deps: Deps = {}): Promise<Place[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const f = deps.fetch ?? fetch;
  const r = await f(geocodeUrl(term), { signal: withTimeout(deps.signal, deps.timeoutMs ?? 8000) });
  if (!r.ok) throw new Error('geocoding ' + r.status);
  return parsePlaces(await r.json());
}

/** Nombre del barrio de una ubicación; si no se puede averiguar, "Zona sin nombre". Nunca tira. */
export async function nameForPosition(lat: number, lng: number, deps: Deps = {}): Promise<string> {
  try {
    const f = deps.fetch ?? fetch;
    const r = await f(reverseUrl(roundCoord(lat), roundCoord(lng)), { signal: withTimeout(deps.signal, deps.timeoutMs ?? 6000) });
    if (!r.ok) return UNNAMED_ZONE;
    return labelFromReverse(await r.json()) ?? UNNAMED_ZONE;
  } catch { return UNNAMED_ZONE; }
}

export class GeoError extends Error {
  constructor(public code: number | undefined) { super('geolocation ' + code); }
}

/** Ubicación del navegador, YA redondeada a ~1 km (la ubicación fina no sale de esta función). */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((ok, ko) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return ko(new GeoError(2));
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: roundCoord(p.coords.latitude), lng: roundCoord(p.coords.longitude) }),
      e => ko(new GeoError(e?.code)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}
