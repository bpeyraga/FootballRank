// "¿Dónde jugás?" y "Ranking de tu zona": tipos y reglas puras (sin Supabase, sin red, sin Preact).
// El OVR sale del mismo ovr() de toda la app: la base solo manda los seis atributos (ver zone_ranking en la migración).
import { ATTRS, ovr, type Pos, type Stats } from '../../shared/model';
import { tier } from '../ranking/ranking';

// ---------- Constantes ----------

/** Radios del selector (km): son los únicos que acepta la base. El ranking se baja una sola vez con el máximo y se filtra acá. */
export const RADII = [5, 10, 25, 50] as const;
export const DEFAULT_RADIUS = 25;
export const MAX_RADIUS = RADII[RADII.length - 1];
/** Cuántos jugadores se dibujan (el resto se alcanza ampliando o filtrando); "vos" siempre se ve. */
export const SHOW_MAX = 50;

export const LABEL_MAX = 60;
/** Nombre de la zona cuando no se pudo averiguar el barrio. En las listas se omite. */
export const UNNAMED_ZONE = 'Zona sin nombre';
export const PRIVACY_NOTE = 'Solo mostramos tu barrio y la distancia aproximada, nunca tu ubicación exacta.';

// ---------- Mi zona ----------

export interface ZoneDraft { label: string; lat: number; lng: number; public: boolean }

/** Una ubicación gruesa: 2 decimales (~1 km). Es lo único que sale del dispositivo, y la base lo exige también. */
export const roundCoord = (n: number): number => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // sin "-0"
};

export const validCoords = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** El borrador listo para guardar: etiqueta recortada, coordenadas redondeadas. null si no sirve. */
export function normalizeZone(z: ZoneDraft): ZoneDraft | null {
  const label = z.label.trim().slice(0, LABEL_MAX);
  if (!label || !validCoords(z.lat, z.lng)) return null;
  return { label, lat: roundCoord(z.lat), lng: roundCoord(z.lng), public: !!z.public };
}

export const sameZone = (a: ZoneDraft | null, b: ZoneDraft | null) =>
  a === b || (!!a && !!b && a.label === b.label && a.lat === b.lat && a.lng === b.lng && a.public === b.public);

export const isUnnamed = (label: string) => label === UNNAMED_ZONE;

// ---------- Textos ----------

/**
 * "a menos de 5 km". La base no da kilómetros exactos sino una banda: 2, 5, 10, 25 o 50 = "a menos de X km"
 * (así nadie puede ubicar a otro jugador midiendo distancias desde varios puntos).
 */
export function fmtDistance(band: number | null | undefined, compact = false): string {
  if (band == null || !Number.isFinite(band) || band <= 0) return '';
  return compact ? `< ${Math.round(band)} km` : `a menos de ${Math.round(band)} km`;
}

/** "Palermo, CABA" → "Palermo" (para los lugares donde no entra la provincia). */
export const shortZone = (label: string) => (isUnnamed(label) ? '' : label.split(',')[0].trim());

/** "Palermo, CABA · a menos de 5 km" (sin el nombre cuando no se pudo averiguar; "tu zona" para uno mismo). Con `short`, solo el barrio y "< 5 km". */
export function zoneLine(p: Pick<ZonePlayer, 'zoneLabel' | 'distanceBand' | 'isMe'>, short = false): string {
  const place = short ? shortZone(p.zoneLabel) : isUnnamed(p.zoneLabel) ? '' : p.zoneLabel;
  return [place, p.isMe ? 'tu zona' : fmtDistance(p.distanceBand, short)].filter(Boolean).join(' · ');
}

/** "12 PJ · 5 goles · 2 figuras" */
export function miniStats(p: Pick<ZonePlayer, 'pj' | 'goals' | 'mvps'>): string {
  return [`${p.pj} PJ`, `${p.goals} ${p.goals === 1 ? 'gol' : 'goles'}`, `${p.mvps} ${p.mvps === 1 ? 'figura' : 'figuras'}`].join(' · ');
}

/** De dónde sale el OVR: votos de compañeros o la autoevaluación del jugador. */
export const ovrSource = (p: Pick<ZonePlayer, 'nVotes'>) =>
  p.nVotes > 0 ? `OVR según ${p.nVotes} ${p.nVotes === 1 ? 'voto' : 'votos'} de compañeros` : 'OVR de su autoevaluación (todavía no lo votaron)';

/** Mensaje para invitar amigos a la zona (WhatsApp / compartir). */
export const inviteText = (label: string, origin: string) =>
  `⚽ Sumate al ranking de ${isUnnamed(label) ? 'mi zona' : label} en Ranking Fútbol y mirá quién es el mejor del barrio: ${origin}/`;

// ---------- Ranking ----------

/** Una fila tal cual la devuelve zone_ranking (sin coordenadas: solo etiqueta y banda de distancia). */
export interface ZoneRow {
  profile_id: string; name: string; photo_url: string | null; pos: Pos; fav_team: string | null; shirt_number: number | null;
  zone_label: string;
  /** 2, 5, 10, 25 o 50: "a menos de X km". */
  distance_band: number;
  rit: number | null; tir: number | null; pas: number | null; reg: number | null; def: number | null; fis: number | null;
  n_votes: number; matches_played: number; goals: number; assists: number; mvps: number; communities: number;
}

export interface ZonePlayer {
  id: string; name: string; photo_url: string | null; pos: Pos; fav_team: string | null; shirt_number: number | null;
  zoneLabel: string; distanceBand: number;
  stats: Stats; ovr: number; tier: 'gold' | 'silver' | 'bronze';
  nVotes: number;
  /** Ya lo votaron compañeros. Si no, su OVR es la autoevaluación (va después de los votados y no entra al podio). */
  voted: boolean;
  pj: number; goals: number; assists: number; mvps: number; communities: number;
  /** Puesto (1 = el mejor) dentro de la lista armada. */
  rank: number; isMe: boolean;
}

/** Los seis atributos de una fila, o null si falta alguno (sin votos ni autoevaluación no hay OVR). */
export function rowStats(r: Pick<ZoneRow, 'rit' | 'tir' | 'pas' | 'reg' | 'def' | 'fis'>): Stats | null {
  const out = {} as Stats;
  for (const [k] of ATTRS) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[k] = v;
  }
  return out;
}

export interface RankOpts { km?: number; pos?: Pos | null }

/**
 * Arma el ranking: dentro del radio (por banda de distancia), con la posición elegida. Primero los que tienen votos de compañeros
 * y después los autoevaluados; en cada grupo, por OVR de mayor a menor. Desempata por partidos jugados (más rodaje primero)
 * y por nombre, así el orden es estable.
 */
export function buildZoneRanking(rows: ZoneRow[], meId: string | null, { km, pos }: RankOpts = {}): ZonePlayer[] {
  const list: Omit<ZonePlayer, 'rank'>[] = [];
  for (const r of rows) {
    if (km != null && r.distance_band > km) continue;
    if (pos && r.pos !== pos) continue;
    const stats = rowStats(r);
    if (!stats) continue;
    const o = ovr(stats, r.pos); // la zona no trae el 🧤: el arquero queda con el promedio simple (igual que en zone_ranking)
    list.push({
      id: r.profile_id, name: r.name, photo_url: r.photo_url, pos: r.pos, fav_team: r.fav_team, shirt_number: r.shirt_number,
      zoneLabel: r.zone_label, distanceBand: r.distance_band, stats, ovr: o, tier: tier(o) as ZonePlayer['tier'],
      nVotes: r.n_votes, voted: r.n_votes > 0, pj: r.matches_played, goals: r.goals, assists: r.assists, mvps: r.mvps, communities: r.communities,
      isMe: r.profile_id === meId,
    });
  }
  list.sort((a, b) => Number(b.voted) - Number(a.voted) || b.ovr - a.ovr || b.pj - a.pj || a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
  return list.map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Cuántos jugadores hay de cada posición dentro del radio (para los botones del filtro). */
export function posCounts(rows: ZoneRow[], km: number): Record<'all' | Pos, number> {
  const c = { all: 0, ARQ: 0, DEF: 0, MED: 0, DEL: 0 };
  for (const r of rows) {
    if (r.distance_band > km || !rowStats(r)) continue;
    c.all++;
    if (r.pos in c) c[r.pos]++;
  }
  return c;
}

/** Lo que se dibuja: los primeros SHOW_MAX y, si "vos" quedás más abajo, tu fila aparte al final. */
export function visibleRanking(list: ZonePlayer[], max = SHOW_MAX): { shown: ZonePlayer[]; mine: ZonePlayer | null; hidden: number } {
  const shown = list.slice(0, max);
  const mine = list.find(p => p.isMe && p.rank > max) ?? null;
  return { shown, mine, hidden: Math.max(0, list.length - shown.length - (mine ? 1 : 0)) };
}

/**
 * Podio y resto de lo que se dibuja: el podio son los primeros 3 CON votos (los autoevaluados no suben: su OVR es lo que ellos
 * mismos se pusieron). Si hay menos de 3 votados, hay menos lugares en el podio. La lista ya viene con los votados primero.
 */
export function splitPodium(shown: ZonePlayer[]): { podium: ZonePlayer[]; rest: ZonePlayer[] } {
  let n = 0;
  while (n < 3 && n < shown.length && shown[n].voted) n++;
  return { podium: shown.slice(0, n), rest: shown.slice(n) };
}

/** Primer radio más grande que el actual donde hay alguien más (para "probá ampliar el radio"). */
export function widerRadius(rows: ZoneRow[], km: number, meId: string | null): number | null {
  for (const r of RADII) {
    if (r <= km) continue;
    if (rows.some(x => x.profile_id !== meId && x.distance_band <= r && rowStats(x))) return r;
  }
  return null;
}

// ---------- Búsqueda de lugares (Open-Meteo geocoding) ----------

export interface Place { label: string; detail: string; lat: number; lng: number }

/** "Ciudad Autónoma de Buenos Aires" → "CABA"; "Provincia de Tucumán" → "Tucumán"; "Partido de Quilmes" → "Quilmes". */
export function shortAdmin(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  if (/^ciudad aut[oó]noma de buenos aires$/i.test(t)) return 'CABA';
  return t.replace(/^(provincia|departamento|partido|municipio) (del|de) /i, '').trim();
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "Palermo, CABA". Si el lugar y la provincia se llaman igual ("Mendoza, Mendoza"), queda solo "Mendoza". */
export function placeLabel(name: unknown, admin1: unknown): string {
  const n = typeof name === 'string' ? name.trim() : '';
  const a = shortAdmin(admin1);
  return (n && a && norm(n) !== norm(a) ? `${n}, ${a}` : n || a).slice(0, LABEL_MAX);
}

/** Resultados de Open-Meteo: lugares con coordenadas redondeadas, sin repetidos. Ignora lo que venga raro. */
export function parsePlaces(json: unknown): Place[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const r of results) {
    const lat = Number(r?.latitude), lng = Number(r?.longitude);
    const label = placeLabel(r?.name, r?.admin1);
    if (!label || !validCoords(lat, lng)) continue;
    const admin2 = shortAdmin(r?.admin2);
    const detail = admin2 && norm(label).split(',')[0] !== norm(admin2) ? admin2 : '';
    const key = `${norm(label)}|${norm(detail)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, detail, lat: roundCoord(lat), lng: roundCoord(lng) });
  }
  return out;
}

/** Nombre de la zona a partir del reverse geocoding (OpenStreetMap): "Palermo, Buenos Aires". null si no hay con qué. */
export function labelFromReverse(json: unknown): string | null {
  const a = (json as { address?: Record<string, unknown> })?.address;
  if (!a || typeof a !== 'object') return null;
  const first = (...keys: string[]) => {
    for (const k of keys) { const v = a[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
    return '';
  };
  const place = first('suburb', 'neighbourhood', 'city_district', 'quarter', 'borough');
  const city = first('city', 'town', 'village', 'municipality', 'county');
  const parts = [place, city].filter((x, i, l) => x && l.findIndex(y => norm(y) === norm(x)) === i);
  const label = (parts.length ? parts.join(', ') : shortAdmin(first('state'))).slice(0, LABEL_MAX);
  return label || null;
}

/** Texto para cada error de geolocalización del navegador (1 = permiso, 2 = no disponible, 3 = demoró). */
export function geoErrorText(code?: number): string {
  if (code === 1) return 'No nos diste permiso para ver tu ubicación. Buscá tu barrio a mano, acá abajo.';
  if (code === 3) return 'Tardó demasiado en detectar tu ubicación. Probá de nuevo o buscá tu barrio.';
  return 'No pudimos detectar tu ubicación. Buscá tu barrio a mano, acá abajo.';
}

/** Mensaje en español para un error al guardar la zona (los códigos salen de set_my_zone). */
export function zoneErrorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? '';
  if (/not_authenticated/.test(m)) return 'Tu sesión venció. Volvé a entrar.';
  if (/bad_label/.test(m)) return 'El nombre de la zona no es válido.';
  if (/bad_coords/.test(m)) return 'La ubicación no es válida. Elegí el lugar de nuevo.';
  if (/too_many_moves/.test(m)) return 'Ya cambiaste tu zona varias veces hoy. Probá mañana.';
  if (/could not find|does not exist|permission denied/i.test(m)) return 'Esta función todavía no está disponible. Probá de nuevo más tarde.';
  return m || 'Error de red';
}
