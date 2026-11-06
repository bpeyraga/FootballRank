import { POS, type Pos } from './model';

/** Un puesto en la cancha: posición y coordenadas en % (x: izquierda→derecha, y: arco rival→arco propio). */
export interface Slot { pos: Pos; x: number; y: number }

/** Fútbol 5 en rombo (1-2-1): arquero, defensor, dos volantes y delantero. */
export const F5: Slot[] = [
  { pos: 'DEL', x: 50, y: 15 },
  { pos: 'MED', x: 20, y: 42 },
  { pos: 'MED', x: 80, y: 42 },
  { pos: 'DEF', x: 50, y: 66 },
  { pos: 'ARQ', x: 50, y: 87 },
];

export interface FP { id: string; pos: Pos; ovr: number | null }
export interface Placed<T> { slot: Slot; p: T | null; alts: T[] }

const byOvr = <T extends FP>(a: T, b: T) => (b.ovr ?? -1) - (a.ovr ?? -1);
const dist = (a: Pos, b: Pos) => Math.abs(POS.indexOf(a) - POS.indexOf(b));

/**
 * Ubica jugadores en la formación: primero cada puesto con el mejor de esa posición,
 * después los puestos vacíos con el más cercano en posición (ARQ<DEF<MED<DEL).
 * `alts`: el resto de los que juegan de eso; `bench`: los que no entraron.
 */
export function lineup<T extends FP>(players: T[], slots: Slot[] = F5): { placed: Placed<T>[]; bench: T[] } {
  const free = [...players].sort(byOvr);
  const take = (p: T) => free.splice(free.indexOf(p), 1)[0];
  const placed: Placed<T>[] = slots.map(slot => ({ slot, p: null, alts: [] }));
  for (const s of placed) { const p = free.find(x => x.pos === s.slot.pos); if (p) s.p = take(p); }
  for (const s of placed) {
    if (s.p || !free.length) continue;
    const best = free.reduce((b, x) => (dist(x.pos, s.slot.pos) < dist(b.pos, s.slot.pos) ? x : b));
    s.p = take(best);
  }
  for (const s of placed) s.alts = free.filter(x => x.pos === s.slot.pos);
  return { placed, bench: free };
}
