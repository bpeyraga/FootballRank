// "De potrero a leyenda": cómo arranca el Desafío del día (nacionalidad, posición, pie, estilo y dificultad salen de la semilla del día). Puro.
import { dailySeed } from './careerDaily';
import { NATIONS } from './careerNations';
import { Rng, seedState } from './careerRng';
import { DIFF_LIST, DPOS_LIST, FOOT_LIST } from './careerSetup';
import { STYLES } from './careerData';
import type { DPos, Difficulty, Foot, NatId, StyleId } from './careerTypes';

export interface DailySetup { day: string; seed: number; year: number; nat: NatId; dpos: DPos; foot: Foot; style: StyleId; diff: Difficulty }

/** El arranque del desafío de ese día: igual para todos. Más de la mitad de los días sale argentino. */
export function dailySetup(day: string): DailySetup {
  const seed = dailySeed(day);
  const r = new Rng(seedState(seed ^ 0x0d41));
  const nat: NatId = r.chance(0.55) ? 'ar' : r.pick(NATIONS.filter(n => n.lg !== null)).id;
  return {
    day, seed, year: Number(day.slice(0, 4)), nat, dpos: r.pick(DPOS_LIST), foot: r.weighted(FOOT_LIST.map(f => [f.id, f.id === 'der' ? 0.7 : 0.15] as const)) ?? 'der',
    style: r.pick(STYLES).id, diff: r.pick(DIFF_LIST).id,
  };
}
