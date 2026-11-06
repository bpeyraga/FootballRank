// Historial del jugador: serie de OVR y partidos recientes. Lógica pura (sin Supabase) para testear sin variables de entorno.
import { outcome, type Team } from './statsCore';

// ---------- Evolución del OVR ----------

/** Fila cruda de ovr_history. */
export interface OvrRow { day: string; ovr: number; n_votes: number }
/** Punto de la serie: `t` es el día en ms UTC (para ubicarlo en el eje X). */
export interface OvrPoint { day: string; t: number; ovr: number; n: number }

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-11-06" -> ms UTC; null si no es una fecha válida. */
export function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(t) ? t : null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-11-06" -> "6 nov". */
export function fmtDay(day: string): string {
  const m = DAY_RE.exec(day);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1] ?? ''}`.trim() : day;
}

/** Fecha corta local de un instante: "6 nov". */
export const fmtShortDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/**
 * Normaliza las filas a una serie lista para graficar: descarta filas inválidas, deja un punto por día
 * (si se repite, gana el último) y ordena de más viejo a más nuevo.
 */
export function normalizeSeries(rows: readonly Partial<OvrRow>[] | null | undefined): OvrPoint[] {
  const byDay = new Map<string, OvrPoint>();
  for (const r of rows ?? []) {
    const t = typeof r?.day === 'string' ? dayMs(r.day) : null;
    const ovr = Number(r?.ovr);
    if (t == null || !Number.isFinite(ovr)) continue;
    const day = r.day!.slice(0, 10);
    byDay.set(day, { day, t, ovr: Math.round(ovr), n: Math.max(0, Math.round(Number(r.n_votes) || 0)) });
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

export interface SeriesSummary {
  first: OvrPoint; last: OvrPoint; min: OvrPoint; max: OvrPoint;
  /** last.ovr - first.ovr */
  delta: number;
}

/** Primer, último, mínimo y máximo (ante empate, el más reciente); null si no hay puntos. */
export function summarizeSeries(points: readonly OvrPoint[]): SeriesSummary | null {
  if (!points.length) return null;
  let min = points[0], max = points[0];
  for (const p of points) {
    if (p.ovr <= min.ovr) min = p;
    if (p.ovr >= max.ovr) max = p;
  }
  const first = points[0], last = points[points.length - 1];
  return { first, last, min, max, delta: last.ovr - first.ovr };
}

export interface ChartBox { width: number; height: number; left: number; right: number; top: number; bottom: number }
export interface ChartPoint { x: number; y: number; p: OvrPoint }
export interface ChartLayout {
  pts: ChartPoint[];
  /** Línea ("M x,y L x,y ..."). */
  line: string;
  /** Rango del eje Y (enteros dentro de 1..99). */
  domain: [number, number];
  /** Valores con línea de guía (extremos y medio). */
  ticks: number[];
  yOf: (v: number) => number;
}

/** Rango del eje Y: el de los datos más aire, siempre dentro de 1..99 y con al menos 6 de alto. */
export function yDomain(min: number, max: number): [number, number] {
  const pad = Math.max(3, Math.ceil((max - min) * 0.2));
  let lo = Math.max(1, Math.floor(min - pad)), hi = Math.min(99, Math.ceil(max + pad));
  if (hi - lo < 6) { // pegado a un borde: estirar hacia el otro lado
    if (lo === 1) hi = Math.min(99, lo + 6); else lo = Math.max(1, hi - 6);
  }
  return [lo, hi];
}

/**
 * Posiciona los puntos en una caja SVG. El X es proporcional al tiempo (los días sin cambios no tienen punto,
 * así que espaciar parejo mentiría); con un solo punto queda centrado.
 */
export function chartLayout(points: readonly OvrPoint[], box: ChartBox): ChartLayout {
  const f = (n: number) => +n.toFixed(1);
  const iw = box.width - box.left - box.right, ih = box.height - box.top - box.bottom;
  const mins = points.map(p => p.ovr);
  const [lo, hi] = points.length ? yDomain(Math.min(...mins), Math.max(...mins)) : [1, 99];
  const yOf = (v: number) => f(box.top + ih * (1 - (v - lo) / (hi - lo)));
  const t0 = points.length ? points[0].t : 0, span = points.length ? points[points.length - 1].t - t0 : 0;
  const pts = points.map(p => ({
    x: f(span > 0 ? box.left + (iw * (p.t - t0)) / span : box.left + iw / 2),
    y: yOf(p.ovr), p,
  }));
  const mid = Math.round((lo + hi) / 2);
  return {
    pts,
    line: pts.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' '),
    domain: [lo, hi],
    ticks: [...new Set([lo, mid, hi])],
    yOf,
  };
}

// ---------- Partidos recientes ----------

/** Un partido jugado por el jugador (anotado 'in', partido en estado 'played'). */
export interface MatchApp {
  match_id: string; title: string; starts_at: string; team: Team | null;
  score_a: number | null; score_b: number | null;
}
/** Promedio de ★ que le dieron sus compañeros en un partido (vista match_scores). */
export interface MatchScore { match_id: string; avg: number; n: number }

export type ResultLetter = 'G' | 'E' | 'P';
export const RESULT_LETTER: Record<'won' | 'drawn' | 'lost', ResultLetter> = { won: 'G', drawn: 'E', lost: 'P' };
export const RESULT_LABEL: Record<ResultLetter, string> = { G: 'Ganó', E: 'Empató', P: 'Perdió' };

export interface MatchLine {
  match_id: string; title: string; starts_at: string;
  result: ResultLetter | null;
  /** Marcador con los goles de su equipo primero ("3-1"); null si no hay equipo o resultado. */
  score: string | null;
  avg: number | null; n: number;
}
export interface MatchHistory {
  /** Los más recientes primero, hasta `limit`. */
  lines: MatchLine[];
  /** Partidos jugados en total (no solo los listados). */
  total: number;
  /** Promedio general de ★ (ponderado por cantidad de calificaciones) sobre todos los partidos; null si nunca lo calificaron. */
  avg: number | null;
  /** Calificaciones recibidas y en cuántos partidos. */
  nRatings: number;
  nRated: number;
}

/** Promedio con 1 decimal. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Arma el historial de partidos: más nuevos primero, con resultado G/E/P y ★ promedio, y el promedio general. */
export function buildMatchHistory(apps: readonly MatchApp[], scores: readonly MatchScore[], limit = 10): MatchHistory {
  const byMatch = new Map<string, MatchScore>();
  for (const s of scores) if (Number.isFinite(s.avg) && s.n > 0) byMatch.set(s.match_id, s);
  const ms = (a: MatchApp) => { const t = Date.parse(a.starts_at); return Number.isFinite(t) ? t : 0; };
  const sorted = [...apps].sort((a, b) => ms(b) - ms(a) || a.match_id.localeCompare(b.match_id));

  let sum = 0, nRatings = 0, nRated = 0;
  for (const a of sorted) {
    const s = byMatch.get(a.match_id);
    if (!s) continue;
    sum += s.avg * s.n; nRatings += s.n; nRated++;
  }
  const lines = sorted.slice(0, Math.max(0, limit)).map<MatchLine>(a => {
    const o = outcome(a.team, a.score_a, a.score_b);
    const s = byMatch.get(a.match_id);
    return {
      match_id: a.match_id, title: a.title, starts_at: a.starts_at,
      result: o ? RESULT_LETTER[o] : null,
      score: o ? (a.team === 'B' ? `${a.score_b}-${a.score_a}` : `${a.score_a}-${a.score_b}`) : null,
      avg: s ? s.avg : null, n: s ? s.n : 0,
    };
  });
  return { lines, total: sorted.length, avg: nRatings ? round1(sum / nRatings) : null, nRatings, nRated };
}

export interface OvrHistory {
  /** false si la migración del historial todavía no está aplicada. */
  available: boolean;
  /** Un punto por día, de más viejo a más nuevo. */
  points: OvrPoint[];
}
