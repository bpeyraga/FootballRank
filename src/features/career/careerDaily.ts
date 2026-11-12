// "De potrero a leyenda": el Desafío del día. Una carrera con la misma semilla y el mismo arranque para todo el mundo ese día (el día cuenta con la hora
// de la Argentina), y la racha de días seguidos con un desafío terminado. Puro y liviano: no importa nada del juego, así Inicio lo puede usar.

/** UTC-3 todo el año (la Argentina no tiene horario de verano desde 2009). */
const AR_OFFSET_MS = -3 * 3600 * 1000;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** El día de la Argentina de un instante: "2026-11-12". */
export function argDay(d: Date = new Date()): string {
  const t = new Date(d.getTime() + AR_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const parse = (day: string): number => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const fmt = (ms: number): string => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
/** El día anterior ("2026-03-01" → "2026-02-28"). */
export const dayBefore = (day: string): string => fmt(parse(day) - 86_400_000);
/** Cuántos días hay de `a` a `b` (b - a). */
export const daysBetween = (a: string, b: string): number => Math.round((parse(b) - parse(a)) / 86_400_000);

/** La semilla del desafío de ese día: la misma para todos (un hash del texto de la fecha). */
export function dailySeed(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

/** La racha guardada: el último día con un desafío terminado y cuántos días seguidos lleva. */
export interface Streak { last: string; n: number }
export const NO_STREAK: Streak = { last: '', n: 0 };

/** Suma un desafío terminado del día `day` a la racha: el mismo día dos veces cuenta una; al día siguiente suma; con un día de por medio arranca de nuevo en 1. */
export function nextStreak(s: Streak, day: string): Streak {
  if (!DAY_RE.test(day)) return s;
  if (s.last === day) return s;
  if (s.last && daysBetween(s.last, day) < 0) return s; // un desafío viejo no baja la racha
  return { last: day, n: s.last && dayBefore(day) === s.last ? s.n + 1 : 1 };
}

/** La racha que se muestra hoy: sigue viva si el último desafío fue hoy o ayer; si pasó más, vuelve a 0. */
export function streakShown(s: Streak, today: string): number {
  if (!s.last || !DAY_RE.test(s.last) || s.n <= 0) return 0;
  return s.last === today || s.last === dayBefore(today) ? s.n : 0;
}

/** ¿Es un texto de día válido? */
export const isDay = (x: unknown): x is string => typeof x === 'string' && DAY_RE.test(x) && !Number.isNaN(parse(x)) && fmt(parse(x)) === x;
