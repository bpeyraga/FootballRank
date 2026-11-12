// Lógica de "Fútbol argentino" para la app: fechas en hora argentina, agrupar partidos por día, escudos,
// resultado de un club y noticias de "tu club". Lo compartido con la Edge Function está en futbolCore.ts.
import { arParts, clubForTeam, finishNews, mentionsClub, SOURCES, type Club, type Match, type NewsItem } from './futbolCore';
import { espnCrestUrl } from '../../shared/teams';

export * from './futbolCore';

const DAY = 86_400_000;
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-DD en hora argentina (para agrupar por día). */
export function dayKey(ms: number): string {
  const { y, m, d } = arParts(ms);
  return `${y}-${p2(m)}-${p2(d)}`;
}
/** "21:00", hora argentina. */
export function timeAR(iso: string): string {
  const { h, mi } = arParts(Date.parse(iso));
  return `${p2(h)}:${p2(mi)}`;
}
/** "Sáb 8 nov", hora argentina. */
export function shortDay(iso: string): string {
  const { wd, d, m } = arParts(Date.parse(iso));
  return `${DAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}
/** "Hoy", "Mañana", "Ayer" o "Sáb 8 nov". */
export function dayLabel(iso: string, nowMs: number): string {
  const k = dayKey(Date.parse(iso));
  if (k === dayKey(nowMs)) return 'Hoy';
  if (k === dayKey(nowMs + DAY)) return 'Mañana';
  if (k === dayKey(nowMs - DAY)) return 'Ayer';
  return shortDay(iso);
}
/** "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 3 d" o "6 nov". */
export function relTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const ds = Math.floor(hs / 24);
  if (ds === 1) return 'ayer';
  if (ds < 7) return `hace ${ds} d`;
  const { d, m } = arParts(t);
  return `${d} ${MONTHS[m - 1]}`;
}

export interface DayGroup { key: string; label: string; date: string; matches: Match[] }
/** Parte la lista (ya ordenada) en días corridos, hora argentina. El rótulo es "Hoy · Vie 6 nov", "Sáb 8 nov"… */
export function groupByDay(ms: Match[], nowMs: number): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of ms) {
    const key = dayKey(Date.parse(m.date));
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      const rel = dayLabel(m.date, nowMs), abs = shortDay(m.date);
      g = { key, label: rel === abs ? abs : `${rel} · ${abs}`, date: m.date, matches: [] };
      out.push(g);
    }
    g.matches.push(m);
  }
  return out;
}

/** Escudo oficial desde ESPN, ya achicado (unos 5 KB). Solo ids numéricos. */
export const crestUrl = espnCrestUrl;

/** Nombre para mostrar: el de la lista de clubes de la app ("Gimnasia de La Plata") o el de ESPN sin la ciudad entre paréntesis. */
export const prettyName = (espn: string): string => clubForTeam(espn)?.name ?? espn.replace(/\s*\([^)]*\)\s*$/, '');

/** Resultado de un partido terminado para un equipo (por id de ESPN): G ganó, E empató, P perdió. */
export function resultFor(m: Match, teamId: string): 'G' | 'E' | 'P' | null {
  const mine = m.h.id === teamId ? m.h : m.a.id === teamId ? m.a : null;
  const other = mine === m.h ? m.a : m.h;
  if (!mine || m.st !== 'post' || mine.score === null || other.score === null) return null;
  return mine.score > other.score ? 'G' : mine.score < other.score ? 'P' : 'E';
}

/** Los 8 primeros de cada zona pasan a los playoffs (solo se marca si la liga está partida en zonas). */
export const QUALIFY_SPOTS = 8;
export const qualifies = (pos: number, zones: number): boolean => zones > 1 && pos <= QUALIFY_SPOTS;

/** Fuentes que hay en una lista de notas, con cuántas son (para los filtros). */
export function newsSources(items: NewsItem[]): { id: string; name: string; n: number }[] {
  const n = new Map<string, number>();
  for (const it of items) n.set(it.source, (n.get(it.source) ?? 0) + 1);
  return [...n].map(([id, count]) => ({ id, name: SOURCES[id] ?? id, n: count }));
}

/** Notas de un club: las de su feed propio (si hay) y las de la lista general que lo nombran; más nuevas primero. */
export function clubNews(c: Club, own: NewsItem[], general: NewsItem[], max = 40): NewsItem[] {
  return finishNews([...own, ...general.filter(n => mentionsClub(`${n.title} ${n.summary}`, c))], max);
}
