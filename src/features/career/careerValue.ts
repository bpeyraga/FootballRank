// "De potrero a leyenda": el valor de mercado del jugador, en euros. Sale del OVR (crece rápido), la edad (pico a mediados de los veinte y caída después),
// el potencial (mientras sos joven), la liga y la categoría del club y la última nota. Puro: nunca da negativo ni NaN.
import type { LeagueId, Tier } from './careerTypes';

/** Cuánto vale el mercado de cada liga respecto de las otras (Premier y LaLiga arriba, las ligas chicas abajo). */
const MARKET: Record<LeagueId, number> = {
  inf: 0.75, ar1: 0.75, ar2: 0.5, br: 0.85, uy: 0.6, cl: 0.6, co: 0.6, py: 0.55, ec: 0.6, mx: 0.75, us: 0.7, sa: 0.8,
  en: 1.3, es: 1.2, it: 1.1, de: 1.15, fr: 1.05, pt: 0.9, nl: 0.9, tr: 0.8,
};
/** Cuánto lo castiga la edad (1 = pico). Cae rápido pasados los treinta: a los 40 vale casi nada. */
const AGE_F: Record<number, number> = {
  16: 0.8, 17: 0.8, 18: 0.85, 19: 0.9, 20: 0.95, 21: 1, 22: 1, 23: 1.02, 24: 1.03, 25: 1.03, 26: 1, 27: 0.97, 28: 0.92, 29: 0.85, 30: 0.75, 31: 0.62,
  32: 0.5, 33: 0.38, 34: 0.28, 35: 0.2, 36: 0.14, 37: 0.1, 38: 0.07, 39: 0.05, 40: 0.035,
};
const MIN_VALUE = 20_000;
const MAX_VALUE = 250_000_000;

export interface ValueIn {
  ovr: number; age: number; potential: number; lg: LeagueId; tier: Tier;
  /** Nota promedio de la última temporada (0 o ausente = sin dato). */
  rating?: number;
}

const num = (x: number, d: number) => (Number.isFinite(x) ? x : d);

/** Valor de mercado en euros (redondeado: de a 10 mil por debajo de 1 millón, de a 50 mil hasta 10, de a 100 mil por encima). */
export function marketValue(o: ValueIn): number {
  const ovr = Math.min(99, Math.max(1, num(o.ovr, 50))), age = Math.round(Math.min(40, Math.max(16, num(o.age, 17))));
  const base = 80_000 * Math.exp((ovr - 45) * 0.158);
  const youth = Math.min(1, Math.max(0, (25 - age) / 7));
  const premium = 1 + Math.max(0, num(o.potential, ovr) - ovr) * 0.03 * youth;
  const form = o.rating && o.rating > 0 ? Math.min(1.3, Math.max(0.85, 1 + (o.rating - 7) * 0.15)) : 1;
  const v = base * (AGE_F[age] ?? 0.035) * premium * (MARKET[o.lg] ?? 0.7) * (0.9 + 0.04 * o.tier) * form;
  const c = Math.min(MAX_VALUE, Math.max(MIN_VALUE, v));
  const step = c < 1e6 ? 10_000 : c < 1e7 ? 50_000 : 100_000;
  return Math.max(MIN_VALUE, Math.round(c / step) * step);
}

/** "€370K", "€1,2M", "€12M", "€150M". */
export function fmtEuro(v: number): string {
  const x = num(v, 0);
  if (x < 1e6) return `€${Math.max(0, Math.round(x / 1000))}K`;
  const m = x / 1e6;
  return `€${(m < 10 ? Math.round(m * 10) / 10 : Math.round(m)).toString().replace('.', ',')}M`;
}
