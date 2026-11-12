// "De potrero a leyenda": lo que se desbloquea con los logros. Solo cosmética (colores de la camiseta, botines y el marco de tu carta): no cambia nada del juego.
import type { AchStats } from './careerAchievements';

export type CosKind = 'shirt' | 'boots' | 'frame';
export interface Cosmetic { id: string; kind: CosKind; /** "botines dorados" (va en "Desbloqueaste: …"). */ label: string; ach: string; color: string }

/** Dentro de cada tipo, los últimos de la lista son los mejores: gana el último que tengas desbloqueado. */
export const COSMETICS: readonly Cosmetic[] = [
  { id: 'trim-red', kind: 'shirt', label: 'vivos rojos en la camiseta', ach: 'start10', color: '#d71920' },
  { id: 'trim-gold', kind: 'shirt', label: 'vivos dorados en la camiseta', ach: 'tit10', color: '#f4bd2c' },
  { id: 'trim-violet', kind: 'shirt', label: 'vivos violetas de leyenda en la camiseta', ach: 'top', color: '#b05cf0' },
  { id: 'boots-white', kind: 'boots', label: 'botines blancos', ach: 'fin1', color: '#f2f4f6' },
  { id: 'boots-neon', kind: 'boots', label: 'botines flúor', ach: 'streak3', color: '#7dff4f' },
  { id: 'boots-gold', kind: 'boots', label: 'botines dorados', ach: 'wc', color: '#f4bd2c' },
  { id: 'frame-bronce', kind: 'frame', label: 'marco de bronce en tu carta', ach: 'start5', color: '#cd7f32' },
  { id: 'frame-plata', kind: 'frame', label: 'marco de plata en tu carta', ach: 'fin5', color: '#c9d3dc' },
  { id: 'frame-oro', kind: 'frame', label: 'marco de oro en tu carta', ach: 'fin10', color: '#f4bd2c' },
  { id: 'frame-leyenda', kind: 'frame', label: 'marco de leyenda en tu carta', ach: 'fin25', color: '#b05cf0' },
];

/** Lo que se desbloquea con ese logro. */
export const unlockedBy = (achId: string): Cosmetic[] => COSMETICS.filter(c => c.ach === achId);

export interface Active { trim: string | null; boots: string | null; frame: string | null; frameId: string | null }
/** Lo que está en uso: lo mejor desbloqueado de cada tipo. */
export function activeCosmetics(unlocked: AchStats['unlocked']): Active {
  const best = (k: CosKind) => [...COSMETICS].reverse().find(c => c.kind === k && unlocked[c.ach]) ?? null;
  const s = best('shirt'), b = best('boots'), f = best('frame');
  return { trim: s?.color ?? null, boots: b?.color ?? null, frame: f?.color ?? null, frameId: f?.id ?? null };
}
