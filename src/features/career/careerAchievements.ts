// "De potrero a leyenda": los Logros, los Récords personales y lo del Desafío del día (racha). Puro y sin entorno: recibe las cuentas guardadas y
// devuelve las nuevas. Cada carrera se cuenta una sola vez al arrancar y una sola vez al terminar (por su semilla), así recargar o tocar dos veces no suma de más.
import { careerOvr } from './careerBase';
import { legacy, totals, type Career } from './careerCore';
import { NO_STREAK, isDay, nextStreak, type Streak } from './careerDaily';
import { INTL } from './careerWorld';

export type AchTier = 'bronce' | 'plata' | 'oro' | 'leyenda';

/** Récords personales (un número cada uno). */
export interface Records { ovr: number; titles: number; goals: number; val: number; score: number }
export type RecKey = keyof Records;
export const REC_KEYS: readonly RecKey[] = ['ovr', 'titles', 'goals', 'val', 'score'];
export const REC_LABEL: Record<RecKey, string> = { ovr: 'OVR máximo', titles: 'Más títulos', goals: 'Más goles', val: 'Valor de mercado máximo', score: 'Mejor puntaje de Legado' };
export const emptyRecords = (): Records => ({ ovr: 0, titles: 0, goals: 0, val: 0, score: 0 });

/** Con qué se cuenta un intento una sola vez: su identificador (el Desafío del día repite la semilla en cada intento) o, si no tiene, su semilla. */
export const attemptKey = (c: Career): number => c.aid ?? c.seed;

/** Lo que dejó una carrera terminada, para compararlo con los récords. */
export function recordsOf(c: Career): Records {
  const t = totals(c);
  return { ovr: t.peak, titles: t.trophies, goals: t.goals, val: t.peakVal, score: legacy(c).score };
}

/** Cuentas de un perfil en este dispositivo. */
export interface AchStats {
  v: 2;
  careersStarted: number;
  careersFinished: number;
  /** Temporadas jugadas, sumando todas las carreras terminadas. */
  seasonsPlayed: number;
  /** Títulos ganados, sumando todas las carreras terminadas. */
  titlesWon: number;
  bestOvr: number;
  /** La mayor cantidad de carreras arrancadas en un mismo día. */
  maxPerDay: number;
  /** Día del último arranque ("2026-11-12") y cuántas carreras van ese día. */
  day: string;
  dayCount: number;
  /** Cosas que se hicieron alguna vez: 'exp' (terminar en Experto), 'ovr90' (retirarse con 90 o más), 'wc' (campeón del mundo), 'top' (Mejor de la historia). */
  flags: string[];
  /** Semillas ya contadas (las últimas 200), para no contar dos veces. */
  started: number[];
  finished: number[];
  /** Récords personales y cuántas veces se rompió alguno. */
  rec: Records;
  recBeaten: number;
  /** Qué récords rompió la última carrera terminada (para destacarlos en su pantalla final). */
  lastRec: { seed: number; ks: RecKey[]; old: Partial<Records> } | null;
  /** Desafío del día: cuántos terminaste, el mejor puntaje de un día, la racha y la racha más larga. */
  dailyDone: number;
  dailyBest: { day: string; score: number } | null;
  streak: Streak;
  maxStreak: number;
  /** Logro -> fecha (ISO) en que se desbloqueó. */
  unlocked: Record<string, string>;
}

export const emptyAch = (): AchStats => ({
  v: 2, careersStarted: 0, careersFinished: 0, seasonsPlayed: 0, titlesWon: 0, bestOvr: 0, maxPerDay: 0, day: '', dayCount: 0, flags: [], started: [], finished: [],
  rec: emptyRecords(), recBeaten: 0, lastRec: null, dailyDone: 0, dailyBest: null, streak: { ...NO_STREAK }, maxStreak: 0, unlocked: {},
});

const KEEP = 200;
const nonNeg = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
const nums = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-KEEP) : []);

/** Lee lo guardado con cualquier basura: lo que no sirve queda en cero. */
export function parseAch(raw: unknown): AchStats {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<AchStats> | null;
    if (!o || typeof o !== 'object' || o.v !== 2) return emptyAch();
    const unlocked: Record<string, string> = {};
    if (o.unlocked && typeof o.unlocked === 'object') for (const [k, v] of Object.entries(o.unlocked)) if (ACH_IDS.has(k) && typeof v === 'string') unlocked[k] = v.slice(0, 40);
    const rec = emptyRecords();
    for (const k of REC_KEYS) rec[k] = nonNeg(o.rec?.[k]);
    const lr = o.lastRec;
    const ks = lr && Array.isArray(lr.ks) ? lr.ks.filter((k): k is RecKey => REC_KEYS.includes(k as RecKey)) : [];
    const old: Partial<Records> = {};
    for (const k of REC_KEYS) if (lr?.old && typeof lr.old[k] === 'number') old[k] = nonNeg(lr.old[k]);
    const db = o.dailyBest;
    const st = o.streak;
    return {
      v: 2, careersStarted: nonNeg(o.careersStarted), careersFinished: nonNeg(o.careersFinished), seasonsPlayed: nonNeg(o.seasonsPlayed), titlesWon: nonNeg(o.titlesWon),
      bestOvr: Math.min(99, nonNeg(o.bestOvr)), maxPerDay: nonNeg(o.maxPerDay), day: typeof o.day === 'string' ? o.day.slice(0, 10) : '', dayCount: nonNeg(o.dayCount),
      flags: Array.isArray(o.flags) ? o.flags.filter((f): f is string => typeof f === 'string').slice(0, 12) : [], started: nums(o.started), finished: nums(o.finished),
      rec, recBeaten: nonNeg(o.recBeaten), lastRec: lr && typeof lr.seed === 'number' && Number.isFinite(lr.seed) ? { seed: lr.seed, ks, old } : null,
      dailyDone: nonNeg(o.dailyDone), dailyBest: db && isDay(db.day) && typeof db.score === 'number' && Number.isFinite(db.score) ? { day: db.day, score: Math.max(0, Math.floor(db.score)) } : null,
      streak: st && isDay(st.last) && nonNeg(st.n) > 0 ? { last: st.last, n: nonNeg(st.n) } : { ...NO_STREAK }, maxStreak: nonNeg(o.maxStreak), unlocked,
    };
  } catch { return emptyAch(); }
}

export interface Ach {
  id: string; icon: string; title: string; desc: string; tier: AchTier;
  /** Cuánto lleva el jugador y cuánto hace falta. */
  value: (s: AchStats) => number; target: number;
}

const flag = (f: string) => (s: AchStats) => (s.flags.includes(f) ? 1 : 0);
const A = (id: string, icon: string, title: string, desc: string, tier: AchTier, value: Ach['value'], target: number): Ach => ({ id, icon, title, desc, tier, value, target });

/** Los logros. */
export const ACHIEVEMENTS: readonly Ach[] = [
  A('start1', '🎽', 'Primer pique', 'Arrancá tu primera carrera.', 'bronce', s => s.careersStarted, 1),
  A('start5', '🥾', 'Le agarraste el gustito', 'Arrancá 5 carreras.', 'bronce', s => s.careersStarted, 5),
  A('start10', '⚽', 'No te sacan de la cancha', 'Arrancá 10 carreras.', 'plata', s => s.careersStarted, 10),
  A('start25', '🔁', 'Vicio de potrero', 'Arrancá 25 carreras.', 'plata', s => s.careersStarted, 25),
  A('start50', '🏟️', 'Habitué del vestuario', 'Arrancá 50 carreras.', 'oro', s => s.careersStarted, 50),
  A('start100', '👑', 'Cien vidas de crack', 'Arrancá 100 carreras.', 'leyenda', s => s.careersStarted, 100),
  A('fin1', '🏁', 'Colgaste los botines', 'Terminá una carrera.', 'bronce', s => s.careersFinished, 1),
  A('fin5', '📖', 'Cinco historias', 'Terminá 5 carreras.', 'plata', s => s.careersFinished, 5),
  A('fin10', '📚', 'Biblioteca de leyendas', 'Terminá 10 carreras.', 'oro', s => s.careersFinished, 10),
  A('fin25', '🏛️', 'Museo propio', 'Terminá 25 carreras.', 'leyenda', s => s.careersFinished, 25),
  A('seas50', '📅', 'Medio siglo de temporadas', 'Jugá 50 temporadas en total.', 'bronce', s => s.seasonsPlayed, 50),
  A('seas200', '🗓️', 'Dos siglos de pretemporadas', 'Jugá 200 temporadas en total.', 'plata', s => s.seasonsPlayed, 200),
  A('seas500', '⏳', 'Eterno', 'Jugá 500 temporadas en total.', 'oro', s => s.seasonsPlayed, 500),
  A('tit10', '🏆', 'Vitrina con polvo', 'Ganá 10 títulos en total.', 'plata', s => s.titlesWon, 10),
  A('tit50', '🥇', 'Coleccionista', 'Ganá 50 títulos en total.', 'oro', s => s.titlesWon, 50),
  A('day3', '⚡', 'Tres en un día', 'Arrancá 3 carreras el mismo día.', 'plata', s => s.maxPerDay, 3),
  A('exp', '🧗', 'Experto de verdad', 'Terminá una carrera en dificultad Experto.', 'oro', flag('exp'), 1),
  A('ovr90', '💎', 'Retiro de diamante', 'Retirate con 90 de OVR o más.', 'oro', flag('ovr90'), 1),
  A('wc', '🌎', 'Campeón del mundo', 'Ganá un Mundial con tu Selección.', 'oro', flag('wc'), 1),
  A('top', '🐐', 'El mejor de la historia', 'Terminá una carrera como "Mejor de la historia".', 'leyenda', flag('top'), 1),
  A('daily1', '📆', 'Desafío aceptado', 'Terminá un Desafío del día.', 'bronce', s => s.dailyDone, 1),
  A('streak3', '🔥', 'Tres días en racha', 'Terminá el Desafío del día 3 días seguidos.', 'plata', s => s.maxStreak, 3),
  A('streak7', '☄️', 'Una semana entera', 'Terminá el Desafío del día 7 días seguidos.', 'oro', s => s.maxStreak, 7),
  A('rec5', '📈', 'Rompe-récords', 'Superá tus propios récords 5 veces.', 'plata', s => s.recBeaten, 5),
];
export const ACH_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map(a => a.id));
export const ACH_TOTAL = ACHIEVEMENTS.length;

/** Avance hacia una meta: 3 de 10 = 30 %. Nunca se pasa del 100 %. */
export function progress(value: number, target: number): { value: number; target: number; pct: number } {
  const t = Math.max(1, target), v = Math.min(t, Math.max(0, Number.isFinite(value) ? value : 0));
  return { value: v, target: t, pct: Math.round((v / t) * 100) };
}
export const progressOf = (a: Ach, s: AchStats) => progress(a.value(s), a.target);
export const isUnlocked = (s: AchStats, id: string) => !!s.unlocked[id];
export const unlockedCount = (s: AchStats) => ACHIEVEMENTS.filter(a => s.unlocked[a.id]).length;

/** Los logros que las cuentas ya alcanzan y todavía no estaban desbloqueados en `prev` (o en las mismas cuentas, si no se pasa). */
export function evaluate(stats: AchStats, prev?: AchStats | null): string[] {
  const had = (prev ?? stats).unlocked;
  return ACHIEVEMENTS.filter(a => !had[a.id] && a.value(stats) >= a.target).map(a => a.id);
}

/** Marca esos logros como desbloqueados en esa fecha. */
export function withUnlocked(stats: AchStats, ids: readonly string[], when: string): AchStats {
  const unlocked = { ...stats.unlocked };
  let added = false;
  for (const id of ids) if (ACH_IDS.has(id) && !unlocked[id]) { unlocked[id] = when; added = true; }
  return added ? { ...stats, unlocked } : stats;
}

const addTo = (xs: number[], n: number) => [...xs, n].slice(-KEEP);

/** Suma una carrera arrancada (una sola vez por semilla). `day` = "2026-11-12". Devuelve las cuentas nuevas y los logros desbloqueados. */
export function recordStart(stats: AchStats, seed: number, day: string, when = new Date().toISOString()): { stats: AchStats; newly: string[] } {
  if (stats.started.includes(seed)) return { stats, newly: [] };
  const dayCount = stats.day === day ? stats.dayCount + 1 : 1;
  const next: AchStats = { ...stats, careersStarted: stats.careersStarted + 1, started: addTo(stats.started, seed), day, dayCount, maxPerDay: Math.max(stats.maxPerDay, dayCount) };
  const newly = evaluate(next, stats);
  return { stats: withUnlocked(next, newly, when), newly };
}

/** Los récords que una carrera supera: solo cuenta si ya había uno anterior (la primera carrera fija la vara, no la rompe). */
export function brokenRecords(rec: Records, now: Records): RecKey[] {
  return REC_KEYS.filter(k => rec[k] > 0 && now[k] > rec[k]);
}

/**
 * Suma una carrera terminada (una sola vez por semilla): temporadas, títulos, mejor OVR, las marcas especiales, los récords y, si era el
 * Desafío del día, el puntaje del día y la racha.
 */
export function recordFinish(stats: AchStats, c: Career, when = new Date().toISOString()): { stats: AchStats; newly: string[]; broken: RecKey[] } {
  const key = attemptKey(c);
  if (c.phase !== 'over' || stats.finished.includes(key)) return { stats, newly: [], broken: [] };
  const t = totals(c), flags = new Set(stats.flags), now = recordsOf(c);
  if (c.diff === 'experto') flags.add('exp');
  if (careerOvr(c.stats, c.pos, c.dpos) >= 90) flags.add('ovr90');
  if (c.history.some(h => h.trophies.includes(INTL.worldCup.name))) flags.add('wc');
  if (legacy(c).index >= 4) flags.add('top');
  const broken = brokenRecords(stats.rec, now);
  const rec = { ...stats.rec };
  const old: Partial<Records> = {};
  for (const k of REC_KEYS) { if (broken.includes(k)) old[k] = stats.rec[k]; rec[k] = Math.max(rec[k], now[k]); }
  let { streak, maxStreak, dailyBest, dailyDone } = stats;
  if (c.daily && isDay(c.daily)) {
    streak = nextStreak(streak, c.daily); maxStreak = Math.max(maxStreak, streak.n); dailyDone += 1;
    dailyBest = dailyBest && dailyBest.day === c.daily && dailyBest.score >= now.score ? dailyBest : { day: c.daily, score: now.score };
  }
  const next: AchStats = {
    ...stats, careersFinished: stats.careersFinished + 1, finished: addTo(stats.finished, key), seasonsPlayed: stats.seasonsPlayed + t.seasons,
    titlesWon: stats.titlesWon + t.trophies, bestOvr: Math.max(stats.bestOvr, t.peak), flags: [...flags], rec, recBeaten: stats.recBeaten + broken.length,
    lastRec: { seed: key, ks: broken, old }, dailyDone, dailyBest, streak, maxStreak,
  };
  const newly = evaluate(next, stats);
  return { stats: withUnlocked(next, newly, when), newly, broken };
}

/** "3/10" y el texto de la meta, para las tarjetas. */
export const progressText = (a: Ach, s: AchStats): string => { const p = progressOf(a, s); return a.target === 1 ? (p.value >= 1 ? 'Listo' : 'Todavía no') : `${p.value}/${p.target}`; };
export const tierLabel: Record<AchTier, string> = { bronce: 'Bronce', plata: 'Plata', oro: 'Oro', leyenda: 'Leyenda' };
