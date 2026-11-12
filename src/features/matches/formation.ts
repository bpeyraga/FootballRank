import { POS, ovr, type Pos, type Stats } from '../../shared/model';

/** Un puesto en la cancha: posición y coordenadas en % (x: izquierda→derecha, y: arco rival→arco propio). */
export interface Slot { pos: Pos; x: number; y: number }

/**
 * Formación: cuántos hay en cada línea de campo, de atrás hacia adelante y sin contar al arquero ("2-1-1").
 * Con un solo jugador (solo el arquero) es ''.
 */
export type Formation = string;

/** Opciones para cada cantidad de jugadores de campo (la primera es la que se usa si no eligieron ninguna). */
const PRESETS: Record<number, Formation[]> = {
  1: ['1'],
  2: ['1-1', '2'],
  3: ['2-1', '1-2', '1-1-1'],
  4: ['1-2-1', '2-2', '2-1-1', '1-1-2'],
  5: ['2-2-1', '2-1-2', '3-1-1', '1-3-1'],
  6: ['2-3-1', '3-2-1', '2-2-2', '3-1-2'],
  7: ['3-3-1', '2-3-2', '3-2-2', '2-4-1'],
  8: ['3-3-2', '4-3-1', '3-4-1', '4-2-2'],
  9: ['3-4-2', '4-3-2', '4-4-1', '3-3-3'],
  10: ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'],
};

/** Para muchos jugadores: líneas de a 5 como mucho (si no, las cartas no entran), con el resto repartido atrás. */
function spread(outfield: number): Formation {
  const lines = Math.max(3, Math.ceil(outfield / 5));
  const base = Math.floor(outfield / lines), extra = outfield % lines;
  return Array.from({ length: lines }, (_, i) => base + (i < extra ? 1 : 0)).join('-');
}

/** Las formaciones posibles para un equipo de `n` jugadores (arquero incluido). */
export function formationsFor(n: number): Formation[] {
  if (n <= 1) return [''];
  return PRESETS[n - 1] ?? [spread(n - 1)];
}

const parse = (f: Formation) => (f ? f.split('-').map(Number) : []);

/** ¿Sirve `f` para un equipo de `n`? (líneas de 1 a 9 jugadores que suman los de campo). */
export function fitsFormation(f: Formation | null | undefined, n: number): f is Formation {
  if (f == null) return false;
  if (n <= 1) return f === '';
  if (!/^[1-9](-[1-9]){0,5}$/.test(f)) return false;
  return parse(f).reduce((t, x) => t + x, 0) === n - 1;
}

/** La guardada si le sirve al equipo como está ahora; si no, la de siempre para esa cantidad. */
export const pickFormation = (saved: Formation | null | undefined, n: number): Formation =>
  fitsFormation(saved, n) ? saved : formationsFor(n)[0];

/**
 * Los puestos de una formación: el 0 es el arco y después cada línea de atrás hacia adelante, de izquierda a derecha.
 * La primera línea es de defensores, la última de delanteros y las del medio de volantes (una sola línea: volantes).
 */
export function slotsFor(f: Formation): Slot[] {
  const lines = parse(f);
  const out: Slot[] = [{ pos: 'ARQ', x: 50, y: 88 }];
  const L = lines.length;
  lines.forEach((k, i) => {
    const y = L === 1 ? 45 : 70 - (i * (70 - 16)) / (L - 1);
    const pos: Pos = L === 1 ? 'MED' : i === 0 ? 'DEF' : i === L - 1 ? 'DEL' : 'MED';
    for (let j = 0; j < k; j++) out.push({ pos, x: 8 + (84 * (j + 0.5)) / k, y });
  });
  return out;
}

/** "2-1-1" → "2-1-1"; '' → "Solo arquero". Para mostrar. */
export const formationLabel = (f: Formation) => f || 'Solo arquero';

export interface FP {
  id: string; pos: Pos; ovr: number | null;
  /** Habilidad como arquero (null = sin calificar). */ gk?: number | null;
  /** Para saber cuánto rinde en otro puesto (OVR ponderado por esa posición). */ stats?: Stats | null;
}

/** OVR del jugador si juega en `pos` (sin stats, su OVR de siempre). */
const ovrIn = (p: FP, pos: Pos) => (p.stats ? ovr(p.stats, pos) : p.ovr ?? -1);
export interface Placed<T> { slot: Slot; p: T | null }

const byOvr = <T extends FP>(a: T, b: T) => (b.ovr ?? -1) - (a.ovr ?? -1);
const dist = (a: Pos, b: Pos) => Math.abs(POS.indexOf(a) - POS.indexOf(b));

/** Quién va al arco: el arquero de posición mejor calificado atajando; si no hay, el que mejor ataja; si nadie está calificado, el de posición más cercana (defensor). */
function pickKeeper<T extends FP>(free: T[]): T | undefined {
  const gk = (p: T) => p.gk ?? -1;
  const arqs = free.filter(p => p.pos === 'ARQ');
  if (arqs.length) return arqs.reduce((b, x) => (gk(x) > gk(b) || (gk(x) === gk(b) && (x.ovr ?? -1) > (b.ovr ?? -1)) ? x : b));
  const rated = free.filter(p => p.gk != null);
  if (rated.length) return rated.reduce((b, x) => (gk(x) > gk(b) ? x : b));
  return free.reduce<T | undefined>((b, x) => (!b || dist(x.pos, 'ARQ') < dist(b.pos, 'ARQ') ? x : b), undefined);
}

/**
 * Ubica jugadores en la formación. Primero respeta los puestos guardados (`saved`: id → número de puesto, si
 * está en rango y libre). Al resto: el arco con `pickKeeper`, después cada puesto con el mejor de esa posición y
 * los que quedan vacíos con el de posición más cercana (ARQ<DEF<MED<DEL; a igual distancia, el de más OVR en ese
 * puesto). `bench`: los que no entraron.
 */
export function lineup<T extends FP>(players: T[], slots: Slot[], saved?: ReadonlyMap<string, number | null>): { placed: Placed<T>[]; bench: T[] } {
  const free = [...players].sort(byOvr);
  const take = (p: T) => free.splice(free.indexOf(p), 1)[0];
  const placed: Placed<T>[] = slots.map(slot => ({ slot, p: null }));
  if (saved) {
    for (const p of [...free]) {
      const i = saved.get(p.id);
      if (i != null && i >= 0 && i < placed.length && !placed[i].p) placed[i].p = take(p);
    }
  }
  const keeper = placed.find(s => s.slot.pos === 'ARQ' && !s.p);
  if (keeper && free.length) { const k = pickKeeper(free); if (k) keeper.p = take(k); }
  for (const s of placed) { if (s.p) continue; const p = free.find(x => x.pos === s.slot.pos); if (p) s.p = take(p); }
  for (const s of placed) {
    if (s.p || !free.length) continue;
    // El de posición más cercana; entre los igual de cercanos, el que más rinde en ese puesto.
    const best = free.reduce((b, x) => {
      const dx = dist(x.pos, s.slot.pos), db = dist(b.pos, s.slot.pos);
      return dx < db || (dx === db && ovrIn(x, s.slot.pos) > ovrIn(b, s.slot.pos)) ? x : b;
    });
    s.p = take(best);
  }
  return { placed, bench: free };
}

/** Cambia de lugar a los jugadores de dos puestos (también sirve para mover a uno a un puesto vacío). */
export function swapSlots<T>(order: (T | null)[], i: number, j: number): (T | null)[] {
  const out = [...order];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
