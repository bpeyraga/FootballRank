// "De potrero a leyenda": lo que le hace al jugador cada opción, con números honestos. Todo sale de las mismas cuentas que usa la temporada
// (careerCore.playSeason), así lo que se muestra no puede contradecir lo que después pasa. Puro y sin entorno.
import { ageCurve, clamp, careerOvr, ovrF } from './careerBase';
import { winOdds } from './careerComps';
import { STYLES } from './careerData';
import { nationOf } from './careerNations';
import { DIFFS } from './careerSetup';
import type { Career, Club, Fx, LeagueId, Opt } from './careerTypes';
import { marketValue, fmtEuro } from './careerValue';
import { LEAGUES } from './careerWorld';

export type Tone = 'good' | 'bad' | 'warn' | 'info';
export interface Chip { id: string; text: string; tone: Tone; title?: string }

const NUMS = ['growth', 'injury', 'minutes', 'form', 'team', 'trust'] as const;
type Num = typeof NUMS[number];
type Flat = Record<Num, number>;

/** Los números de una opción (sin riesgo): crecimiento, lesión, minutos, nota, equipo y confianza. */
const flat = (fx: Fx | undefined): Flat => ({
  growth: fx?.growth ?? 0, injury: fx?.injury ?? 0, minutes: fx?.minutes ?? 0, form: fx?.form ?? 0, team: fx?.team ?? 0, trust: fx?.trust ?? 0,
});
const add = (a: Flat, b: Flat): Flat => ({ growth: a.growth + b.growth, injury: a.injury + b.injury, minutes: a.minutes + b.minutes, form: a.form + b.form, team: a.team + b.team, trust: a.trust + b.trust });

export interface Outcome { p: number; n: Flat; captain: boolean }
/** Los resultados posibles de una opción con su probabilidad: uno solo si no hay riesgo, dos (sale bien / sale mal) si lo hay. */
export function outcomes(fx: Fx): Outcome[] {
  const base = flat(fx), cap = !!fx.captain;
  const g = fx.gamble;
  if (!g) return [{ p: 1, n: base, captain: cap }];
  return [
    { p: g.p, n: add(base, flat(g.ok)), captain: cap || !!g.ok?.captain },
    { p: 1 - g.p, n: add(base, flat(g.bad)), captain: cap || !!g.bad?.captain },
  ];
}

/** Cuánto de los partidos jugás: la misma cuenta que usa la temporada (sin el azar). */
export const shareFor = (diff: number): number => clamp(0.55 + diff / 18, 0.04, 1);

export interface Effects {
  /** Cambio de tu OVR esta temporada respecto de no hacer nada: esperado y rango (con riesgo). */
  ovr: { exp: number; lo: number; hi: number };
  /** Cambio en la parte de partidos que jugás (esperado) y en partidos aproximados. */
  share: number; games: number;
  /** Cambio en la chance de lesión, en puntos de probabilidad (0.05 = 5 puntos). */
  injury: number;
  team: number; form: number; trust: number;
}

/** El efecto esperado de una opción sobre vos, hoy: usa tus stats, tu club y tu edad. */
export function fxEffects(c: Career, fx: Fx): Effects {
  const D = DIFFS[c.diff], style = STYLES.find(s => s.id === c.style) ?? STYLES[0];
  const ox = ovrF(c.stats, c.pos, c.dpos);
  const shareAt = (pw: number, trust: number, captain: boolean, mins: number) => shareFor(ox - pw + D.minutes + mins * 4 + trust * 1.5 + (captain ? 1.5 : 0));
  const now = shareAt(c.club.pw, c.trust, c.captain, c.mods.minutes);
  const dest = fx.move ? fx.move.club : c.club;
  const k = ageCurve(c.age) > 0 ? 1.1 : 0.3;
  let ovr = 0, share = 0, injury = 0, team = 0, form = 0, trust = 0, lo = Infinity, hi = -Infinity;
  for (const o of outcomes(fx)) {
    const tr = fx.move ? clamp(o.n.trust, -2, 2) : clamp(c.trust + o.n.trust, -2, 2);
    const sh = shareAt(dest.pw, tr, fx.move ? o.captain : c.captain || o.captain, c.mods.minutes + o.n.minutes) - now;
    const inj = o.n.injury * style.injury * D.injury;
    const d = o.n.growth + sh * k - inj * 0.3;
    ovr += o.p * d; share += o.p * sh; injury += o.p * inj; team += o.p * o.n.team; form += o.p * o.n.form; trust += o.p * o.n.trust;
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return { ovr: { exp: ovr, lo, hi }, share, games: share * (LEAGUES[dest.lg].games + 5), injury, team, form, trust };
}

/** La chance de ganar la final que está en juego (momento clave) si elegís esa opción: la misma cuenta que usa la resolución. null si no hay final pendiente. */
export function finalOdds(c: Career, fx: Fx): number | null {
  const t = c.tension;
  if (!t) return null;
  const base = fx.fin ?? 0, g = fx.gamble;
  if (!g) return winOdds(t.mine + base, t.opp);
  return g.p * winOdds(t.mine + base + (g.ok?.fin ?? 0), t.opp) + (1 - g.p) * winOdds(t.mine + base + (g.bad?.fin ?? 0), t.opp);
}

// ---------- Sueldo y vidriera de cada club ----------

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

// ---------- Las etiquetas de cada opción ----------

const sgn = (x: number) => (x < 0 ? '−' : '+');
/** "+0,8" / "−0,3" (con coma, como se escribe acá). */
export const fmtDelta = (x: number): string => `${sgn(x)}${Math.abs(x).toFixed(1).replace('.', ',')}`;
const pct = (p: number) => `${Math.round(p * 100)} %`;

/** Todas las etiquetas de una opción: efecto en el OVR, minutos, lesiones, títulos, riesgo con su probabilidad y, si es un fichaje, sueldo, vidriera y oferta. */
export function optionChips(c: Career, o: Opt): Chip[] {
  const fx = o.fx, e = fxEffects(c, fx), out: Chip[] = [];
  const { lo, hi, exp } = e.ovr;
  if (Math.max(Math.abs(lo), Math.abs(hi)) >= 0.15) {
    const single = hi - lo < 0.15;
    out.push({
      id: 'ovr', text: `OVR ${single ? fmtDelta(exp) : `${fmtDelta(lo)} a ${fmtDelta(hi)}`}`, tone: lo >= 0.1 ? 'good' : hi <= -0.1 ? 'bad' : 'warn',
      title: 'Cuánto cambia tu OVR esta temporada, comparado con no tocar nada',
    });
  }
  if (e.games >= 2) out.push({ id: 'min', text: `Minutos ▲ +${Math.round(e.games)} PJ`, tone: 'good', title: 'Partidos que jugás de más, aproximado' });
  else if (e.games <= -2) out.push({ id: 'min', text: `Minutos ▼ −${Math.abs(Math.round(e.games))} PJ`, tone: 'bad', title: 'Partidos que jugás de menos, aproximado' });
  if (e.injury >= 0.08) out.push({ id: 'inj', text: 'Riesgo de lesión: alto', tone: 'bad' });
  else if (e.injury >= 0.03) out.push({ id: 'inj', text: 'Riesgo de lesión: medio', tone: 'warn' });
  else if (e.injury <= -0.03) out.push({ id: 'inj', text: 'Riesgo de lesión: bajo', tone: 'good' });
  if (e.team >= 0.04) out.push({ id: 'team', text: 'Títulos ▲', tone: 'good', title: 'Más chances de títulos para el equipo' });
  else if (e.team <= -0.03) out.push({ id: 'team', text: 'Títulos ▼', tone: 'bad', title: 'Menos chances de títulos para el equipo' });
  if (e.form >= 0.1) out.push({ id: 'form', text: 'Rendimiento ▲', tone: 'good' });
  else if (e.form <= -0.1) out.push({ id: 'form', text: 'Rendimiento ▼', tone: 'bad' });
  if (e.trust >= 0.5) out.push({ id: 'trust', text: 'Confianza del DT ▲', tone: 'good' });
  else if (e.trust <= -0.5) out.push({ id: 'trust', text: 'Confianza del DT ▼', tone: 'bad' });
  const fo = finalOdds(c, fx);
  if (fo !== null && c.tension) {
    const p0 = winOdds(c.tension.mine, c.tension.opp);
    out.push({ id: 'final', text: Math.abs(fo - p0) < 0.005 ? `Ganar la final: ${pct(fo)}` : `Ganar la final: ${pct(p0)} → ${pct(fo)}`, tone: fo > p0 + 0.005 ? 'good' : fo < p0 - 0.005 ? 'bad' : 'info', title: 'Chance de ganar el partido que se define' });
  }
  if (fx.cap === true) out.push({ id: 'cap', text: 'Más partidos en la Selección', tone: 'good' });
  if (fx.oly === true) out.push({ id: 'oly', text: 'Juegos Olímpicos', tone: 'good' });
  if (fx.captain) out.push({ id: 'capt', text: 'Capitán', tone: 'good' });
  if (fx.pos) out.push({ id: 'pos', text: 'Cambio de puesto', tone: 'info' });

  // Mudanzas: sueldo, vidriera y lo que ofrecen
  if (fx.move) {
    const m = fx.move, from = c.club, to = m.club;
    if (m.kind === 'loan') out.push({ id: 'move', text: 'Cesión', tone: 'info', title: `Después volvés a ${from.name}` });
    else if (m.kind === 'return') out.push({ id: 'move', text: 'Volvés a casa', tone: 'info' });
    if (from.lg !== 'inf' && m.kind !== 'loan') {
      const r = payIndex(to) / Math.max(0.05, payIndex(from));
      if (r >= 1.25) out.push({ id: 'pay', text: 'Sueldo ▲', tone: 'good' });
      else if (r <= 0.8) out.push({ id: 'pay', text: 'Sueldo ▼', tone: 'bad' });
      const dv = LEAGUES[to.lg].vis - LEAGUES[from.lg].vis;
      if (dv >= 2) out.push({ id: 'vis', text: 'Vidriera ▲', tone: 'good', title: 'Más chances de que te vea la Selección' });
      else if (dv <= -2) out.push({ id: 'vis', text: 'Vidriera ▼', tone: 'bad', title: 'Menos chances de que te vea la Selección' });
      if (m.kind === 'transfer') out.push({ id: 'fee', text: `Ofrecen ${fmtEuro(offerFee(c, to))}`, tone: 'info', title: 'Lo que pagarían por tu pase' });
    }
  }

  // Riesgo con su probabilidad (la misma que usa la temporada)
  const g = fx.gamble;
  if (g) {
    const ok = pct(g.p), bad = pct(1 - g.p);
    if (g.okTag) out.push({ id: 'okp', text: `${g.okTag} ${ok}`, tone: 'good' });
    if (g.badTag) out.push({ id: 'badp', text: `${g.badTag} ${bad}`, tone: 'bad' });
    if (!g.okTag && !g.badTag) {
      const f = flat(g.bad);
      const hurts = !!g.badText || f.growth < 0 || f.minutes < 0 || f.form < 0 || f.trust < 0 || f.injury > 0;
      out.push(hurts ? { id: 'risk', text: `${bad} de que salga mal`, tone: 'warn' } : { id: 'risk', text: `${ok} de que salga bien`, tone: 'good' });
    }
  }
  return out;
}

export { nationOf };
