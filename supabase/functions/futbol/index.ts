// Edge Function `futbol`: tabla, partidos y noticias del fútbol argentino, con caché en la tabla futbol_cache.
// La llama la app con el token del usuario (verify_jwt activado; además se verifica acá que haya usuario).
// POST { kind: 'table' | 'fixtures' | 'news' | 'team', team?: string, force?: boolean }
//   -> { ok, kind, data, fetched_at, stale }      (error: { error } con 401 sin sesión, 400 pedido inválido, 502 sin datos)
// Fuentes: ESPN (API pública no oficial, sin clave) para tabla y partidos, y los RSS de Olé, Clarín, Infobae y
// La Nación para las noticias. De cada nota se guarda solo titular, resumen corto, imagen y link a la nota original.
// Caché: si lo guardado tiene menos de 12 min (2 min con partido en juego) se devuelve eso; si no, se pide afuera,
// se guarda y se devuelve. Si la fuente falla se devuelve lo viejo con stale:true. "force" renueva si pasó 1 min.
// Sin secretos propios: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
// Una Edge Function no puede importar de src: el bloque SHARED es una copia exacta de src/lib/futbolCore.ts
// (`npm test` verifica que sigan iguales). Editá ese archivo y pegá acá el bloque completo.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// ===== BEGIN SHARED (copia de src/lib/futbolCore.ts) =====
// Lógica pura de "Fútbol argentino": tipos, normalizadores de ESPN, lector de RSS y clubes con sus alias.
// SIN imports: la usan la app (vía futbol.ts) y la Edge Function `futbol`, que lleva una copia EXACTA de este
// archivo entre los marcadores BEGIN/END SHARED (una Edge Function no puede importar de src; el deploy sube un
// solo archivo). `npm test` verifica que la copia siga igual: si editás esto, pegalo también en la función.

// ---------- Tipos (lo que guarda el caché y lo que recibe la app) ----------
export type MatchState = 'pre' | 'in' | 'post'; // por jugar · en juego · terminado
export interface Side { id: string; name: string; score: number | null }
export interface Match {
  id: string; date: string; st: MatchState; label: string; phase: string | null; venue: string | null;
  h: Side; a: Side;
}
export interface Row { pos: number; id: string; team: string; pj: number; pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; pts: number }
export interface Group { name: string; rows: Row[] }
export interface Table { season: number | null; torneo: string | null; groups: Group[] }
export interface Fixtures { matches: Match[] }
export interface NewsItem { title: string; summary: string; url: string; image: string | null; source: string; date: string }
export interface News { items: NewsItem[] }
export interface TeamData { name: string; id: string | null; next: Match[]; last: Match[]; news: NewsItem[] }

export const SOURCES: Record<string, string> = { ole: 'Olé', clarin: 'Clarín', infobae: 'Infobae', lanacion: 'La Nación' };

const MIN = 60_000;
const DAY = 86_400_000;
export const TTL_MS = 12 * MIN; // cuánto vale el caché
export const LIVE_TTL_MS = 2 * MIN; // con partido en juego (o por arrancar) se renueva más seguido
export const FORCE_MS = MIN; // "Actualizar" no le pega a la fuente más de una vez por minuto
export const PAST_DAYS = 24;
export const FUTURE_DAYS = 25;

// ---------- Texto ----------
/** Sin tildes y con el mismo apóstrofe (para comparar). */
export const strip = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’´`]/g, "'");
export const norm = (s: string): string => strip(s).toLowerCase().replace(/\s+/g, ' ').trim();

const num = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? ((v as any).value ?? (v as any).displayValue) : v;
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ---------- Fecha en Argentina ----------
const AR_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Fecha y hora de un instante en America/Argentina/Buenos_Aires (wd: 0 = domingo). */
export function arParts(ms: number): { y: number; m: number; d: number; h: number; mi: number; wd: number } {
  const o: Record<string, string> = {};
  for (const p of AR_FMT.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: WD[o.weekday] ?? 0 };
}

/** Meses (AAAAMM, hora argentina) que cubren la ventana de partidos: el anterior, el actual y el siguiente. */
export function monthsAround(ms: number): string[] {
  const { y, m } = arParts(ms);
  const at = (add: number) => {
    const t = y * 12 + (m - 1) + add;
    return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}`;
  };
  return [at(-1), at(0), at(1)];
}

// ---------- ESPN: partidos ----------
const STATUS: Record<string, string> = {
  STATUS_HALFTIME: 'Entretiempo', STATUS_POSTPONED: 'Postergado', STATUS_CANCELED: 'Cancelado', STATUS_CANCELLED: 'Cancelado',
  STATUS_SUSPENDED: 'Suspendido', STATUS_ABANDONED: 'Suspendido', STATUS_DELAYED: 'Demorado',
  STATUS_FINAL_PEN: 'Final (penales)', STATUS_FINAL_AET: 'Final (alargue)', STATUS_FULL_TIME: 'Final', STATUS_FINAL: 'Final',
};
function statusLabel(name: string, st: MatchState, detail: string): string {
  if (STATUS[name]) return STATUS[name];
  if (st === 'in') return detail || 'En juego';
  return st === 'post' ? 'Final' : '';
}

/** Fase de eliminación según el nombre de la etapa de ESPN ("apertura---round-of-16"); null en el torneo regular. */
function phaseOf(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/round[ -]of[ -]16/.test(s)) return 'Octavos de final';
  if (/quarter/.test(s)) return 'Cuartos de final';
  if (/semi/.test(s)) return 'Semifinal';
  if (/(?:^|[- ])final$/.test(s)) return 'Final';
  return null;
}

/** Un evento de ESPN (scoreboard) → partido compacto. null si le falta algo esencial. */
export function normalizeEvent(e: any): Match | null {
  const c = e?.competitions?.[0];
  const pick = (side: string) => (c?.competitors ?? []).find((x: any) => x?.homeAway === side);
  const h = pick('home'), a = pick('away');
  const ms = Date.parse(e?.date);
  if (!c || !h?.team || !a?.team || Number.isNaN(ms)) return null;
  const t = c.status?.type ?? e.status?.type ?? {};
  const st: MatchState = t.state === 'in' ? 'in' : t.state === 'post' ? 'post' : 'pre';
  const side = (x: any): Side => ({
    id: String(x.team.id ?? x.id), name: String(x.team.displayName ?? x.team.name ?? '?'), score: st === 'pre' ? null : num(x.score),
  });
  let label = statusLabel(String(t.name ?? ''), st, String(t.shortDetail ?? c.status?.displayClock ?? ''));
  const ph = num(h.shootoutScore), pa = num(a.shootoutScore);
  if (t.name === 'STATUS_FINAL_PEN' && ph !== null && pa !== null) label = `Final (penales ${ph}-${pa})`;
  return {
    id: String(e.id), date: new Date(ms).toISOString(), st, label,
    phase: phaseOf(String(e.season?.slug ?? e.seasonType?.name ?? '')),
    venue: c.venue?.fullName ? String(c.venue.fullName) : null,
    h: side(h), a: side(a),
  };
}

/** Respuestas de varios meses del scoreboard → partidos de la ventana (últimos PAST_DAYS y próximos FUTURE_DAYS), por fecha. */
export function normalizeFixtures(responses: any[], nowMs: number): Fixtures {
  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const r of responses) {
    for (const e of r?.events ?? []) {
      const m = normalizeEvent(e);
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      const t = Date.parse(m.date);
      if (m.st !== 'in' && (t < nowMs - PAST_DAYS * DAY || t > nowMs + FUTURE_DAYS * DAY)) continue;
      matches.push(m);
    }
  }
  matches.sort((x, y) => Date.parse(x.date) - Date.parse(y.date) || x.id.localeCompare(y.id));
  return { matches };
}

/** ¿Hay que mirar seguido? Un partido en juego, o que ya debería haber arrancado. */
export function fixturesTtl(f: Fixtures | null | undefined, nowMs: number): number {
  const live = (f?.matches ?? []).some(m => {
    const t = Date.parse(m.date);
    return m.st === 'in' || (m.st === 'pre' && t <= nowMs + 5 * MIN && t >= nowMs - 4 * 60 * MIN);
  });
  return live ? LIVE_TTL_MS : TTL_MS;
}

// ---------- ESPN: tabla ----------
function rowOf(e: any, i: number): Row {
  const s: Record<string, number> = {};
  for (const x of e?.stats ?? []) {
    const v = num(x?.value);
    if (x?.name && v !== null) s[x.name] = v;
  }
  const t = e?.team ?? {};
  const gf = s.pointsFor ?? 0, gc = s.pointsAgainst ?? 0;
  return {
    pos: s.rank ?? i + 1, id: String(t.id ?? ''), team: String(t.displayName ?? t.name ?? '?'),
    pj: s.gamesPlayed ?? 0, pg: s.wins ?? 0, pe: s.ties ?? 0, pp: s.losses ?? 0,
    gf, gc, dg: s.pointDifferential ?? gf - gc, pts: s.points ?? 0,
  };
}

/** Torneo vigente según las etapas con tabla del año (el que contiene hoy; si no, el último que ya empezó). */
function currentTorneo(seasons: any, nowMs: number): string | null {
  const types = ((seasons?.[0]?.types ?? []) as any[]).filter(t => t?.hasStandings);
  const active = types.find(t => Date.parse(t.startDate) <= nowMs && nowMs <= Date.parse(t.endDate));
  const past = [...types].reverse().find(t => Date.parse(t.startDate) <= nowMs);
  const name = (active ?? past)?.name;
  return name ? String(name) : null;
}

/** standings de ESPN → zonas con sus filas ("Group A" → "Zona A"). Sirve también para una tabla única. */
export function normalizeTable(s: any, nowMs: number): Table {
  const parts: { name: string; entries: any[] }[] = (s?.children ?? []).map((c: any) => ({
    name: String(c?.name ?? '').replace(/^Group\s+/i, 'Zona '), entries: c?.standings?.entries ?? [],
  }));
  if (!parts.length && s?.standings?.entries) parts.push({ name: '', entries: s.standings.entries });
  const groups: Group[] = parts
    .map(p => ({ name: p.name, rows: p.entries.map(rowOf).sort((a, b) => a.pos - b.pos || b.pts - a.pts) }))
    .filter(g => g.rows.length);
  const season = num(s?.children?.[0]?.standings?.season) ?? num(s?.season?.year) ?? num(s?.season);
  return { season, torneo: currentTorneo(s?.seasons, nowMs), groups };
}

// ---------- Noticias (RSS) ----------
const ENT: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
};
const decode = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  }
  return ENT[e.toLowerCase()] ?? m;
});

/** Contenido de la primera etiqueta <name>…</name> (crudo), o null. */
function inner(s: string, name: string): string | null {
  const m = s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}
/** Valor de un atributo de una etiqueta suelta (`<enclosure url="…" />`). */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? null) : null;
}

/** Texto plano de un valor de RSS: saca CDATA, etiquetas HTML y entidades; junta los espacios. */
function plain(raw: string | null): string {
  if (!raw) return '';
  const c = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  let t = c ? c[1] : decode(raw);
  t = t.replace(/<(?:br|\/p|\/li|\/h\d|\/div)\b[^>]*>/gi, ' ').replace(/<\/?[a-z][^>]*>/gi, '');
  return decode(t).replace(/\s+/g, ' ').trim();
}

/** Recorta en una palabra y agrega "…" (los resúmenes son de hasta 200 caracteres; nunca se copia la nota). */
export function clip(s: string, max = 200): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

const IMG_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;
function cleanUrl(u: string | null): string | null {
  if (!u) return null;
  const s = decode(u.trim()).replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://');
  return /^https:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 700 ? s : null;
}
/** Imagen de la nota: media:content, media:thumbnail, enclosure o el primer <img>. */
function findImage(body: string, extra: string): string | null {
  for (const tag of body.match(/<media:content\b[^>]*>/gi) ?? []) {
    const u = attr(tag, 'url'), ty = `${attr(tag, 'type') ?? ''} ${attr(tag, 'medium') ?? ''}`;
    if (u && (/image/i.test(ty) || (!/video|audio/i.test(ty) && IMG_EXT.test(u)))) { const r = cleanUrl(u); if (r) return r; }
  }
  for (const tag of body.match(/<media:thumbnail\b[^>]*>/gi) ?? []) { const r = cleanUrl(attr(tag, 'url')); if (r) return r; }
  for (const tag of body.match(/<enclosure\b[^>]*>/gi) ?? []) {
    const u = attr(tag, 'url');
    if (u && (/^image/i.test(attr(tag, 'type') ?? '') || IMG_EXT.test(u))) { const r = cleanUrl(u); if (r) return r; }
  }
  const img = (decode(body) + ' ' + extra).match(/<img\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i);
  return img ? cleanUrl(img[1]) : null;
}

/**
 * Notas de un feed RSS: título, resumen corto sin HTML, imagen, link y fecha. Se saltea las que no tienen
 * título, link http(s) o fecha. El cuerpo completo (content:encoded) solo se mira para encontrar una imagen.
 */
export function parseRss(xml: string, source: string, max = 60): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    if (out.length >= max) break;
    const full = m[1];
    const enc = inner(full, 'content:encoded') ?? '';
    const body = enc ? full.replace(enc, '') : full;
    const title = plain(inner(body, 'title'));
    const url = plain(inner(body, 'link'));
    const ms = Date.parse(plain(inner(body, 'pubDate') ?? inner(body, 'dc:date')));
    if (!title || !/^https?:\/\//i.test(url) || Number.isNaN(ms)) continue;
    let summary = clip(plain(inner(body, 'description')));
    if (norm(summary) === norm(title)) summary = '';
    out.push({ title: clip(title, 220), summary, url, image: findImage(body, enc.slice(0, 6000)), source, date: new Date(ms).toISOString() });
  }
  return out;
}

/** Otros deportes (los feeds generales de deportes los traen mezclados). Se mira el título y el link. */
const OTHER_SPORT = /\b(rugby|los pumas|top 14|urba|tenis|tennis|roland garros|wimbledon|atp|wta|b[aá]squet|basquet|nba|v[oó]ley|hockey|golf|automovilismo|f[oó]rmula[ -]?1|f1|motogp|gran premio|ciclismo|boxeo|ufc|nataci[oó]n|atletismo|handball|p[aá]del|nfl|juegos ol[ií]mpicos)\b/i;
export const isOtherSport = (n: Pick<NewsItem, 'title' | 'url'>): boolean => OTHER_SPORT.test(`${n.title} ${n.url}`);
/** Palabras que delatan una nota de fútbol (si no aparece ninguna ni el nombre de un club, no es de fútbol). */
const FOOTBALL = /\b(f[uú]tbol(?:istas?)?|goles?|goleador(?:es)?|arquer[oa]s?|delanter[oa]s?|mediocampistas?|hinchas?|selecci[oó]n|mundial|libertadores|sudamericana|clausura|apertura|primera divisi[oó]n|primera nacional|liga profesional|copa argentina|dt|t[eé]cnico|entrenador|scaloni|messi|cristiano)\b/i;
export const isFootball = (n: Pick<NewsItem, 'title' | 'summary' | 'url'>): boolean =>
  FOOTBALL.test(`${n.title} ${n.summary} ${n.url}`) || CLUBS.some(c => mentionsClub(`${n.title} ${n.summary}`, c));

/** Lo mejor de un feed: si es de todos los deportes, solo fútbol; lo más nuevo primero y con tope. */
export function pickFeed(items: NewsItem[], general: boolean, cap: number): NewsItem[] {
  return items
    .filter(n => !general || (!isOtherSport(n) && isFootball(n)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, cap);
}

const linkKey = (u: string): string => {
  try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, ''); } catch { return u; }
};
const titleKey = (t: string): string => norm(t).replace(/[^a-z0-9]+/g, ' ').trim();

/** Junta notas de varias fuentes: sin repetidas (mismo link o mismo título), más nuevas primero, hasta `max`. */
export function finishNews(items: NewsItem[], max = 40): NewsItem[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const seen = new Map<string, NewsItem>();
  const out: NewsItem[] = [];
  for (const n of sorted) {
    const keys = [linkKey(n.url), titleKey(n.title)];
    const dup = keys.map(k => seen.get(k)).find(Boolean);
    if (dup) { // se queda la más nueva, pero aprovechamos la imagen / el resumen de la repetida
      dup.image ??= n.image;
      if (!dup.summary) dup.summary = n.summary;
      keys.forEach(k => seen.set(k, dup));
      continue;
    }
    const copy = { ...n };
    keys.forEach(k => seen.set(k, copy));
    out.push(copy);
  }
  return out.slice(0, max);
}

// ---------- Clubes: nombre en la app (teams.ts) ↔ ESPN ↔ Olé ↔ alias para encontrarlos en las noticias ----------
export interface Club {
  name: string; // como se guarda en profiles.fav_team
  espn: string | null; // nombre del equipo en ESPN
  ole: string | null; // feed propio del club en Olé: https://www.ole.com.ar/rss/<ole>/
  alias: string[]; // cómo lo nombran las noticias (distingue mayúsculas: "Boca" sí, "boca" no)
  not?: string[]; // frases que se ignoran antes de buscar (p. ej. "Independiente Rivadavia" para Independiente)
}
const club = (name: string, espn: string | null, ole: string | null, alias: string[], not?: string[]): Club =>
  not ? { name, espn, ole, alias, not } : { name, espn, ole, alias };

export const CLUBS: Club[] = [
  club('Aldosivi', 'Aldosivi', 'aldosivi', ['Aldosivi']),
  club('Argentinos Juniors', 'Argentinos Juniors', 'argentinos', ['Argentinos Juniors', 'Argentinos Jrs', 'Bicho']),
  club('Atlético Tucumán', 'Atlético Tucumán', 'atletico-tucuman', ['Atlético Tucumán', 'Decano']),
  club('Banfield', 'Banfield', 'banfield', ['Banfield', 'Taladro']),
  club('Barracas Central', 'Barracas Central', 'barracas-central', ['Barracas Central', 'Barracas', 'Guapo']),
  club('Belgrano', 'Belgrano (Córdoba)', 'belgrano', ['Belgrano', 'Pirata']),
  club('Boca Juniors', 'Boca Juniors', 'boca-juniors', ['Boca Juniors', 'Boca', 'Xeneize']),
  club('Central Córdoba (SdE)', 'Central Córdoba (Santiago del Estero)', null, ['Central Córdoba', 'Ferroviario']),
  club('Defensa y Justicia', 'Defensa y Justicia', 'defensa-y-justicia', ['Defensa y Justicia', 'Halcón']),
  club('Deportivo Riestra', 'Deportivo Riestra', 'deportivo-riestra', ['Riestra', 'Malevo']),
  club('Estudiantes de La Plata', 'Estudiantes de La Plata', 'estudiantes', ['Estudiantes de La Plata', 'Estudiantes', 'Pincha'],
    ['Estudiantes de Río Cuarto', 'Estudiantes (RC)', 'Estudiantes RC']),
  club('Estudiantes de Río Cuarto', 'Estudiantes de Río Cuarto', 'estudiantes-rio-cuarto', ['Estudiantes de Río Cuarto', 'Estudiantes (RC)', 'Estudiantes RC']),
  club('Gimnasia de La Plata', 'Gimnasia La Plata', 'gimnasia-y-esgrima', ['Gimnasia de La Plata', 'Gimnasia LP', 'Gimnasia La Plata', 'Gimnasia', 'Lobo'],
    ['Gimnasia de Mendoza', 'Gimnasia (Mendoza)', 'Gimnasia Mendoza', 'Gimnasia y Esgrima de Mendoza', 'Gimnasia (M)']),
  club('Gimnasia de Mendoza', 'Gimnasia (Mendoza)', 'gimnasia-de-mendoza', ['Gimnasia de Mendoza', 'Gimnasia (Mendoza)', 'Gimnasia Mendoza', 'Gimnasia y Esgrima de Mendoza', 'Gimnasia (M)']),
  club('Godoy Cruz', 'Godoy Cruz', 'godoy-cruz', ['Godoy Cruz', 'Tomba']),
  club('Huracán', 'Huracán', 'huracan', ['Huracán']),
  club('Independiente', 'Independiente', 'independiente', ['Independiente'], ['Independiente Rivadavia', 'Ind. Rivadavia']),
  club('Independiente Rivadavia', 'Independiente Rivadavia', 'independiente-rivadavia', ['Independiente Rivadavia', 'Ind. Rivadavia']),
  club('Instituto', 'Instituto (Córdoba)', 'instituto', ['Instituto']),
  club('Lanús', 'Lanús', 'lanus', ['Lanús', 'Granate']),
  club("Newell's Old Boys", "Newell's Old Boys", 'newells-old-boys', ["Newell's Old Boys", "Newell's", 'Newells', 'Lepra']),
  club('Platense', 'Platense', 'platense', ['Platense', 'Calamar']),
  club('Racing Club', 'Racing Club', 'racing', ['Racing', 'Academia']),
  club('River Plate', 'River Plate', 'river-plate', ['River Plate', 'River', 'Millonario']),
  club('Rosario Central', 'Rosario Central', 'rosario-central', ['Rosario Central', 'Canalla']),
  club('San Lorenzo', 'San Lorenzo', 'san-lorenzo', ['San Lorenzo', 'Ciclón']),
  club('San Martín de San Juan', null, 'san-martin-sj', ['San Martín de San Juan', 'San Martín (San Juan)', 'San Martín (SJ)', 'San Martín SJ']),
  club('Sarmiento', 'Sarmiento (Junín)', 'sarmiento-junin', ['Sarmiento']),
  club('Talleres', 'Talleres (Córdoba)', 'talleres', ['Talleres']),
  club('Tigre', 'Tigre', 'tigre', ['Tigre']),
  club('Unión', 'Unión (Santa Fe)', 'union', ['Unión de Santa Fe', 'Unión (Santa Fe)', 'Unión (SF)', 'Tatengue']),
  club('Vélez Sarsfield', 'Vélez Sarsfield', 'velez', ['Vélez Sarsfield', 'Vélez', 'Fortín']),
  // Ascenso: sin tabla en ESPN, pero tienen noticias
  club('All Boys', null, 'all-boys', ['All Boys']),
  club('Almagro', null, 'almagro', ['Almagro']),
  club('Arsenal de Sarandí', null, 'arsenal', ['Arsenal de Sarandí', 'Arsenal (Sarandí)']),
  club('Atlanta', null, 'atlanta', ['Atlanta'], ['Atlanta United']),
  club('Chacarita', null, 'chacarita', ['Chacarita', 'Funebrero']),
  club('Chicago', null, 'chicago', ['Nueva Chicago']),
  club('Colón', null, 'colon', ['Colón de Santa Fe', 'Colón (Santa Fe)', 'Colón']),
  club('Ferro Carril Oeste', null, 'ferro', ['Ferro Carril Oeste', 'Ferro']),
  club('Los Andes', null, 'los-andes', ['Los Andes']),
  club('Morón', null, 'deportivo-moron', ['Deportivo Morón', 'Morón']),
  club('Quilmes', null, 'quilmes', ['Quilmes', 'Cervecero']),
  club('San Martín de Tucumán', null, null, ['San Martín de Tucumán', 'San Martín (Tucumán)', 'San Martín (T)']),
  club('Temperley', null, 'temperley', ['Temperley', 'Gasolero']),
];

const BY_NAME = new Map(CLUBS.map(c => [norm(c.name), c]));
/** El club de profiles.fav_team (el nombre exacto de la lista de teams.ts), o null. */
export const clubOf = (name: string | null | undefined): Club | null => (name ? BY_NAME.get(norm(name)) ?? null : null);

/** ¿Este nombre de equipo de ESPN es ese club? ("Belgrano (Córdoba)" es Belgrano; "Independiente Rivadavia" no es Independiente). */
export function sameClub(c: Club, teamName: string): boolean {
  const n = norm(teamName), bare = n.replace(/\s*\([^)]*\)/g, '').trim();
  return [c.espn, c.name].some(x => !!x && (norm(x) === n || norm(x) === bare));
}
/** El club (de la lista de la app) que corresponde a un equipo de ESPN, o null. */
export const clubForTeam = (teamName: string): Club | null => CLUBS.find(c => sameClub(c, teamName)) ?? null;

const reCache = new Map<string, RegExp>();
const word = (a: string): RegExp => {
  let r = reCache.get(a);
  if (!r) {
    // Sin lookbehind (no existe en iPhones con iOS < 16.4)
    r = new RegExp(`(?:^|[^A-Za-z0-9])${strip(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`);
    reCache.set(a, r);
  }
  return r;
};
/** ¿El texto nombra al club? Palabra entera, con la mayúscula del alias, sin tildes. */
export function mentionsClub(text: string, c: Club): boolean {
  let s = strip(text);
  for (const n of c.not ?? []) s = s.split(strip(n)).join(' ');
  return c.alias.some(a => word(a).test(s));
}

/** Próximos (hasta n) y últimos (hasta n) partidos de un club, a partir de los partidos del caché. */
export function teamMatches(ms: Match[], c: Club, n = 3): { id: string | null; next: Match[]; last: Match[] } {
  const mine = ms.filter(m => sameClub(c, m.h.name) || sameClub(c, m.a.name));
  const first = mine[0];
  const id = first ? (sameClub(c, first.h.name) ? first.h.id : first.a.id) : null;
  const t = (m: Match) => Date.parse(m.date);
  return {
    id,
    next: mine.filter(m => m.st !== 'post').sort((a, b) => t(a) - t(b)).slice(0, n),
    last: mine.filter(m => m.st === 'post').sort((a, b) => t(b) - t(a)).slice(0, n),
  };
}
// ===== END SHARED =====

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ---------- Fuentes (todas fijas: nada del pedido se mete en una URL) ----------
const ESPN = 'https://site.api.espn.com/apis';
const SCOREBOARD = (month: string) => `${ESPN}/site/v2/sports/soccer/arg.1/scoreboard?dates=${month}&limit=300`;
const STANDINGS = `${ESPN}/v2/sports/soccer/arg.1/standings`;
const OLE_CLUB = (slug: string) => `https://www.ole.com.ar/rss/${slug}/`;
// general: feed de todos los deportes (se descartan las notas de otros deportes); cap: cuántas se toman de cada feed
const FEEDS = [
  { source: 'ole', url: 'https://www.ole.com.ar/rss/futbol-primera/', general: false, cap: 20 },
  { source: 'ole', url: 'https://www.ole.com.ar/rss/ultimas-noticias/', general: true, cap: 10 },
  { source: 'clarin', url: 'https://www.clarin.com/rss/deportes/', general: true, cap: 12 },
  { source: 'infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/deportes/', general: true, cap: 14 },
  { source: 'lanacion', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/deportes/futbol/', general: false, cap: 14 },
];

async function get(url: string, as: 'json' | 'text', ms = 6000): Promise<any> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FutbolRank/1.0)',
      Accept: as === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return as === 'json' ? await r.json() : await r.text();
}

// ---------- Caché ----------
interface Reply<T> { data: T; fetched_at: string; stale: boolean }

async function cached<T>(key: string, ttl: (d: T | null) => number, build: () => Promise<T>, force = false): Promise<Reply<T>> {
  const { data: row } = await db.from('futbol_cache').select('data,fetched_at').eq('key', key).maybeSingle();
  const old = row ? (row.data as T) : null;
  const age = row ? Date.now() - Date.parse(row.fetched_at) : Infinity;
  const limit = force ? Math.min(ttl(old), FORCE_MS) : ttl(old);
  if (row && age < limit) return { data: old as T, fetched_at: row.fetched_at, stale: false };
  try {
    const data = await build();
    const fetched_at = new Date().toISOString();
    const { error } = await db.from('futbol_cache').upsert({ key, data, fetched_at });
    if (error) console.error('cache write', key, error.message);
    return { data, fetched_at, stale: false };
  } catch (e) {
    console.error('futbol', key, (e as Error).message);
    if (row) return { data: old as T, fetched_at: row.fetched_at, stale: true };
    throw e;
  }
}

// ---------- Armado de cada tipo ----------
async function buildTable(): Promise<Table> {
  const t = normalizeTable(await get(STANDINGS, 'json'), Date.now());
  if (!t.groups.length) throw new Error('ESPN sin tabla');
  return t;
}

async function buildFixtures(): Promise<Fixtures> {
  const now = Date.now();
  const res = await Promise.allSettled(monthsAround(now).map(m => get(SCOREBOARD(m), 'json')));
  const ok = res.map(r => (r.status === 'fulfilled' ? r.value : null));
  if (!ok[1]) throw new Error('ESPN sin el mes actual'); // los vecinos son opcionales; el actual no
  return normalizeFixtures(ok.filter(Boolean), now);
}

async function buildNews(): Promise<News> {
  const res = await Promise.allSettled(FEEDS.map(f => get(f.url, 'text')));
  const items: NewsItem[] = [];
  let ok = 0;
  res.forEach((r, i) => {
    if (r.status === 'rejected') return console.error('feed', FEEDS[i].url, (r.reason as Error)?.message);
    ok++;
    items.push(...pickFeed(parseRss(r.value, FEEDS[i].source), FEEDS[i].general, FEEDS[i].cap));
  });
  if (!ok) throw new Error('ningún feed respondió');
  return { items: finishNews(items, 40) };
}

const fixturesTtlFn = (d: Fixtures | null) => fixturesTtl(d, Date.now());
const getFixtures = (force = false) => cached<Fixtures>('fixtures', fixturesTtlFn, buildFixtures, force);

/** Próximos y últimos partidos de un club (salen de los partidos en caché) + las notas de su feed propio de Olé. */
async function buildTeam(c: Club, force: boolean): Promise<TeamData> {
  const fx = await getFixtures(force).catch(() => null);
  let own: NewsItem[] = [];
  let newsOk = !c.ole;
  if (c.ole) {
    try { own = parseRss(await get(OLE_CLUB(c.ole), 'text'), 'ole', 20); newsOk = true; } catch (e) { console.error('feed club', c.ole, (e as Error).message); }
  }
  if (!fx && !newsOk) throw new Error('sin datos del club');
  const tm = teamMatches(fx?.data.matches ?? [], c);
  return { name: c.name, id: tm.id, next: tm.next, last: tm.last, news: finishNews(own, 10) };
}

const teamKey = (c: Club) => `team:${norm(c.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: u } = await db.auth.getUser(token);
  if (!u?.user) return json({ error: 'unauthorized' }, 401);

  const p = await req.json().catch(() => ({})) as { kind?: unknown; team?: unknown; force?: unknown };
  const kind = String(p.kind ?? '');
  const force = p.force === true;
  const ttl = () => TTL_MS;

  try {
    let r: Reply<unknown>;
    if (kind === 'table') r = await cached<Table>('table', ttl, buildTable, force);
    else if (kind === 'fixtures') r = await getFixtures(force);
    else if (kind === 'news') r = await cached<News>('news', ttl, buildNews, force);
    else if (kind === 'team') {
      const c = clubOf(typeof p.team === 'string' ? p.team.slice(0, 80) : null);
      if (!c) return json({ ok: true, kind, data: { name: '', id: null, next: [], last: [], news: [] }, fetched_at: new Date().toISOString(), stale: false });
      r = await cached<TeamData>(teamKey(c), ttl, () => buildTeam(c, force), force);
    } else return json({ error: 'bad_kind' }, 400);
    return json({ ok: true, kind, ...r });
  } catch (e) {
    console.error('futbol', kind, (e as Error).message);
    return json({ error: 'upstream' }, 502);
  }
});
