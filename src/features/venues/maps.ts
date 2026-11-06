// Canchas: links de Google Maps, mapa embebido y "Cómo llegar". Funciones puras: no tocan Supabase.
// La Edge Function `place` (supabase/functions/place/index.ts) duplica parseMapsUrl/isMapsUrl: no puede importar de src.

export interface Venue {
  id: string; community_id: string; name: string; address: string | null;
  maps_url: string | null; lat: number | null; lng: number | null;
}
export type VenueLoc = Pick<Venue, 'name' | 'address' | 'lat' | 'lng'>;

export interface ParsedPlace { name: string | null; lat: number | null; lng: number | null }

const NUM = '-?\\d{1,3}(?:\\.\\d+)?';
const COORDS = new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);
const validLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;
const pair = (a: string, b: string): { lat: number; lng: number } | null => {
  const lat = +a, lng = +b;
  return validLat(lat) && validLng(lng) ? { lat, lng } : null;
};

/** Hosts de Google Maps que aceptamos: google.<tld>/maps, maps.google.<tld>, maps.app.goo.gl y goo.gl/maps. */
const GOOGLE = /^(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const GOOGLE_MAPS = /^maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;

export function isMapsUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'maps.app.goo.gl' || GOOGLE_MAPS.test(h)) return true;
  if (h === 'goo.gl') return u.pathname === '/maps' || u.pathname.startsWith('/maps/');
  return GOOGLE.test(h) && (u.pathname === '/maps' || u.pathname.startsWith('/maps/'));
}

/** Nombre, latitud y longitud a partir de un link largo de Google Maps (cualquiera puede venir null). */
export function parseMapsUrl(url: string): ParsedPlace {
  const out: ParsedPlace = { name: null, lat: null, lng: null };
  let u: URL;
  try { u = new URL(url.trim()); } catch { return out; }

  const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
  let name: string | null = null;
  if (place) {
    try { name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim(); } catch { name = null; }
  }

  // Coordenadas: primero el punto exacto del lugar (!3d..!4d..), después el centro del mapa (@lat,lng), después ?q= / ?query= / ?ll=
  const full = u.pathname + u.search;
  let c: { lat: number; lng: number } | null = null;
  const d = full.match(new RegExp(`!3d(${NUM})!4d(${NUM})`));
  if (d) c = pair(d[1], d[2]);
  if (!c) {
    const at = full.match(new RegExp(`@(${NUM}),(${NUM})`));
    if (at) c = pair(at[1], at[2]);
  }
  let q: string | null = null;
  for (const k of ['q', 'query', 'destination', 'll']) {
    const v = u.searchParams.get(k);
    if (!v) continue;
    const m = v.match(COORDS);
    if (m) { if (!c) c = pair(m[1], m[2]); } else if (!q && k !== 'll') q = v.trim();
  }

  // Un pin sin nombre viene como /maps/place/-34.17,-58.97: eso no es un nombre
  if (name) {
    const m = name.match(COORDS);
    if (m) { if (!c) c = pair(m[1], m[2]); name = null; }
  }
  out.name = name || q || null;
  if (c) { out.lat = c.lat; out.lng = c.lng; }
  return out;
}

const hasCoords = (v: VenueLoc) => v.lat != null && v.lng != null;
const textQuery = (v: VenueLoc) => [v.name, v.address].map(s => s?.trim()).filter(Boolean).join(' ');

/** Mapa para un <iframe>: por coordenadas si las hay; si no, por nombre y dirección. */
export function embedUrl(v: VenueLoc): string {
  const q = hasCoords(v) ? `${v.lat},${v.lng}` : encodeURIComponent(textQuery(v));
  return `https://maps.google.com/maps?q=${q}&z=16&output=embed`;
}

/** "Ver en el mapa": el link guardado de la cancha o, si no tiene, una búsqueda por coordenadas o por nombre y dirección. */
export function mapUrl(v: VenueLoc & { maps_url?: string | null }): string {
  if (v.maps_url) return v.maps_url;
  const q = hasCoords(v) ? `${v.lat},${v.lng}` : encodeURIComponent(textQuery(v));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** "Cómo llegar": abre Google Maps con la ruta hacia la cancha. */
export function directionsUrl(v: VenueLoc): string {
  const dest = hasCoords(v) ? `${v.lat},${v.lng}` : encodeURIComponent(textQuery(v));
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}
