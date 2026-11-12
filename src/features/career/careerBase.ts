// "De potrero a leyenda": cuentas básicas (OVR por puesto, curva de edad, calendario). Puro, sin entorno.
import { ATTRS, type Pos, type Stats } from '../../shared/model';
import { weightsOf } from './careerSetup';
import type { DPos } from './careerTypes';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round1 = (x: number) => Math.round(x * 10) / 10;

export const MIN_STAT = 1;
export const MAX_STAT = 99;
export const START_AGE = 17;
/** Se retira a la fuerza al llegar a esta edad. */
export const MAX_AGE = 40;
/** Desde esta edad podés elegir retirarte. */
export const RETIRE_FROM = 32;
/** Año de calendario de la primera temporada si no se indica otro (el del Mundial 2026). */
export const DEFAULT_YEAR = 2026;

/** Año de calendario de la temporada que se juega a esa edad: marca los Mundiales, las Copas América y los Juegos Olímpicos. */
export const seasonYear = (c: { y0: number; age: number }): number => c.y0 + (c.age - START_AGE);

/** OVR (sin redondear) con el peso de cada stat según el puesto (y la posición en la cancha, si se indica). */
export const ovrF = (s: Stats, pos: Pos, dpos?: DPos): number => {
  const w = weightsOf(pos, dpos);
  return ATTRS.reduce((t, [k]) => t + s[k] * w[k], 0);
};
export const careerOvr = (s: Stats, pos: Pos, dpos?: DPos): number => Math.round(ovrF(s, pos, dpos));

/** "1 partido", "3 partidos". */
export const pl = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Color de la carta (misma regla que el resto de la app). */
export const cardTier = (o: number): 'gold' | 'silver' | 'bronze' => (o >= 75 ? 'gold' : o >= 65 ? 'silver' : 'bronze');

const CURVE: Record<number, number> = {
  17: 4.2, 18: 4.0, 19: 3.6, 20: 3.2, 21: 2.8, 22: 2.4, 23: 2.0, 24: 1.6, 25: 1.2, 26: 0.8, 27: 0.4,
  28: 0.1, 29: 0, 30: -0.3, 31: -1.0, 32: -1.7, 33: -2.3, 34: -2.9, 35: -3.4, 36: -3.9, 37: -4.4, 38: -4.9, 39: -5.4,
};
/**
 * Cuánto cambia el OVR en la temporada que se juega a esa edad, para un jugador "promedio":
 * crece hasta los 27, hace meseta hasta los 30 y cae cada vez más rápido desde los 31.
 */
export const ageCurve = (age: number): number => (age >= 40 ? -6 : CURVE[Math.round(clamp(age, 17, 39))]);

/** Lo que le queda por crecer a un jugador "promedio" desde esa edad (inclusive) hasta los 27. */
export function remainingGrowth(age: number): number {
  let t = 0;
  for (let a = Math.max(17, Math.round(age)); a <= 27; a++) t += CURVE[a];
  return t;
}

/** "Serías titular", "Arrancarías en el banco"… según la diferencia entre tu OVR y el nivel del club. */
export function expectedRole(diff: number): string {
  return diff >= 5 ? 'Serías la figura' : diff >= 0 ? 'Serías titular' : diff >= -5 ? 'Pelearías el puesto' : 'Arrancarías en el banco';
}
export function roleLabel(share: number): string {
  return share >= 0.88 ? 'Figura indiscutida' : share >= 0.68 ? 'Titular' : share >= 0.45 ? 'Rotación' : share >= 0.2 ? 'Suplente' : 'Casi sin minutos';
}
