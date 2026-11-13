// "De potrero a leyenda": las etiquetas de cada opción (seguro o con riesgo). Todo sale de la misma probabilidad que usa la temporada
// (careerCore.applyFx), así lo que se muestra no puede contradecir lo que después pasa. Puro y sin entorno.
import { winOdds } from './careerComps';
import type { Career, Fx, Opt } from './careerTypes';
import { marketValue } from './careerValue';
import { careerOvr, clamp } from './careerBase';
import { LEAGUES } from './careerWorld';
import type { Club, LeagueId } from './careerTypes';

export type Tone = 'safe' | 'risk' | 'good' | 'bad' | 'info';
export interface Chip { id: string; text: string; tone: Tone }

const pct = (p: number) => `${Math.round(p * 100)} %`;

/** La chance de que salga mal una opción (0 si es segura) y su nivel: bajo (menos de 30 %), medio o alto (45 % o más). */
export function riskOf(o: Opt): { pBad: number; level: 'bajo' | 'medio' | 'alto' | 'ninguno' } {
  const g = o.fx.gamble;
  if (!g) return { pBad: 0, level: 'ninguno' };
  const pBad = 1 - g.p;
  return { pBad, level: pBad >= 0.45 ? 'alto' : pBad >= 0.3 ? 'medio' : 'bajo' };
}

/** La chance de ganar la final que está en juego (momento clave) si elegís esa opción: la misma cuenta que usa la resolución. null si no hay final pendiente. */
export function finalOdds(c: Career, fx: Fx): number | null {
  const t = c.tension;
  if (!t) return null;
  const base = fx.fin ?? 0, g = fx.gamble;
  if (!g) return winOdds(t.mine + base, t.opp);
  return g.p * winOdds(t.mine + base + (g.ok?.fin ?? 0), t.opp) + (1 - g.p) * winOdds(t.mine + base + (g.bad?.fin ?? 0), t.opp);
}

/**
 * Las etiquetas de una opción: la segura dice "Seguro" y lo que ganás; la arriesgada dice el nivel de riesgo, lo que ganás y lo que puede salir mal
 * con su probabilidad. En una final, también la chance de ganarla.
 */
export function optionChips(c: Career, o: Opt): Chip[] {
  const out: Chip[] = [];
  if (o.kind === 'safe') out.push({ id: 'kind', text: '🛡️ Seguro', tone: 'safe' });
  else { const k = riskOf(o); out.push({ id: 'kind', text: `🔥 Riesgo ${k.level === 'ninguno' ? 'medio' : k.level}`, tone: 'risk' }); }
  const fo = finalOdds(c, o.fx);
  if (fo !== null && c.tension) {
    const p0 = winOdds(c.tension.mine, c.tension.opp);
    out.push({ id: 'final', text: Math.abs(fo - p0) < 0.005 ? `🏆 Ganás: ${pct(fo)}` : `🏆 Ganás: ${pct(p0)} → ${pct(fo)}`, tone: fo > p0 + 0.005 ? 'good' : fo < p0 - 0.005 ? 'bad' : 'info' });
  } else out.push({ id: 'up', text: `▲ ${o.up}`, tone: 'good' });
  if (o.kind === 'risky' && o.down) out.push({ id: 'down', text: `⚠ ${o.down} · ${pct(riskOf(o).pBad)}`, tone: 'bad' });
  return out;
}

// ---------- Sueldo y vidriera de cada club (para el texto de las ofertas) ----------

const PAY: Record<LeagueId, number> = {
  inf: 0.1, ar1: 0.5, ar2: 0.25, br: 0.7, uy: 0.35, cl: 0.35, co: 0.35, py: 0.3, ec: 0.3, mx: 0.9, us: 1, sa: 1.9, en: 1.7, es: 1.4, it: 1.2, de: 1.3, fr: 1.2, pt: 0.7, nl: 0.8, tr: 0.9,
};
/** Sueldo relativo de un club (un número del juego: sube con la liga y con la fuerza del club). */
export const payIndex = (c: Club): number => PAY[c.lg] * (0.6 + Math.max(0, c.pw - 55) * 0.04);
/** Lo que ofrecen por vos: tu valor de mercado corrido por cuánto más fuerte (o más flojo) es el club que te quiere. */
export function offerFee(c: Career, club: Club): number {
  const last = c.history[c.history.length - 1];
  const v = marketValue({ ovr: careerOvr(c.stats, c.pos, c.dpos), age: c.age, potential: c.potential, lg: c.club.lg, tier: c.club.tier, rating: last?.rating });
  return Math.round(v * clamp(0.9 + (club.pw - c.club.pw) * 0.02, 0.7, 1.6) / 10_000) * 10_000;
}
export const vitrinaOf = (lg: LeagueId): number => LEAGUES[lg].vis;
