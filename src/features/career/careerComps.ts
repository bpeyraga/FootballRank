// "De potrero a leyenda": las competencias de una temporada. Todo con probabilidades que salen de la fuerza del club y de lo que aportás vos.
// Puro y con semilla: recibe el generador y devuelve datos (no toca el estado de la carrera).
import type { Pos } from '../../shared/model';
import { AWARD, ASSIST_RATE, GOAL_RATE, contMvp, lgAward } from './careerData';
import { clamp } from './careerBase';
import type { Rng } from './careerRng';
import type { Club, ContId, LeagueId } from './careerTypes';
import {
  ARG_PW, ARG_U23_PW, CONTS, INTL, LEAGUES, isCopaYear, isFinalissimaYear, isWorldCupYear, leagueAvg, leagueTop,
} from './careerWorld';

const sig = (x: number) => 1 / (1 + Math.exp(-x));
/** Cuánto pesa la diferencia de fuerza en un cruce (más alto = más parejo). */
export const SCALE = 6.5;

/** Cómo le fue a un equipo en un torneo: en qué ronda quedó (o si ganó todo) y cuántos partidos jugó. */
export interface Run { round: number; won: boolean; matches: number; name: string }

export interface Tourney { rounds: readonly string[]; lo: number; hi: number; base: number }

/**
 * Un torneo por rondas: la primera puede ser una fase de grupos o de liga (alcanza con pasar), las demás son eliminación.
 * Los rivales suben de nivel de `lo` a `hi`. `legs` 2 = ida y vuelta (menos la final).
 */
export function runTournament(mine: number, t: Tourney, r: Rng, legs: 1 | 2 = 1, name = ''): Run {
  const n = t.rounds.length;
  let matches = 0;
  for (let i = 0; i < n; i++) {
    const opp = t.lo + (t.hi - t.lo) * (n > 1 ? i / (n - 1) : 1);
    const group = i === 0 && t.base > 0;
    const p = sig((mine + r.normal(0, 2.5) - (group ? opp - 4 : opp)) / SCALE);
    matches += group ? t.base : legs === 2 && i < n - 1 ? 2 : 1;
    if (!r.chance(p)) return { round: i, won: false, matches, name };
  }
  return { round: n - 1, won: true, matches, name };
}

const CUP_ROUNDS = ['Treintaidosavos de final', 'Dieciseisavos de final', 'Octavos de final', 'Cuartos de final', 'Semifinales', 'Final'] as const;

/** La copa nacional de la liga del club (null si no hay o es de inferiores). Los de Ascenso juegan la Copa Argentina contra los de Primera. */
export function cupRun(club: Club, boost: number, r: Rng): (Run & { cup: string }) | null {
  const L = LEAGUES[club.lg];
  if (!L.cup) return null;
  const f: LeagueId = club.lg === 'ar2' ? 'ar1' : club.lg;
  const rounds = CUP_ROUNDS.slice(CUP_ROUNDS.length - L.cupRounds);
  return { ...runTournament(club.pw + boost, { rounds, lo: leagueAvg(f) - 7, hi: leagueTop(f) - 2, base: 0 }, r, 1, L.cup), cup: L.cup };
}

/** "en octavos de final", "en la fase de grupos"… */
export function eliminatedAt(round: string): string {
  return /^Fase/.test(round) ? `en la ${round.toLowerCase()}` : round === 'Final' ? 'en la final' : `en ${round.toLowerCase()}`;
}

/** Copa continental que se juega al año siguiente, según la que ganaste (el campeón sube de copa). */
export const CHAMP_NEXT: Record<ContId, ContId> = { lib: 'lib', sud: 'lib', cl: 'cl', el: 'cl', ecl: 'el', ccc: 'ccc', acl: 'acl' };
/** Las copas continentales cuyo campeón juega el Mundial de Clubes. */
export const CWC_CONTS: readonly ContId[] = ['lib', 'cl', 'ccc', 'acl'];

// ---------- Selección ----------

export interface NatOut { caps: number; capGoals: number; trophies: string[]; lines: string[]; wc: boolean; copa: boolean; oly: boolean }

/** El Mundial o la Copa América de ese año (null si no hay). */
export const natTournament = (year: number): { name: string; t: typeof INTL.worldCup | typeof INTL.copaAmerica } | null =>
  isWorldCupYear(year) ? { name: 'el Mundial', t: INTL.worldCup } : isCopaYear(year) ? { name: 'la Copa América', t: INTL.copaAmerica } : null;

/**
 * Lo que juegás con la Selección Argentina (si te convocó y aceptaste) y con la Sub-23 en los Juegos Olímpicos (si fuiste).
 * El Mundial, la Copa América y la Finalissima salen del calendario; los títulos cuentan si jugaste al menos 3 partidos.
 */
export function nationalSeason(o: { year: number; ox: number; missed: number; capG: number; called: boolean; oly: boolean }, r: Rng): NatOut {
  const out: NatOut = { caps: 0, capGoals: 0, trophies: [], lines: [], wc: false, copa: false, oly: false };
  const part = 1 - o.missed * 0.6;
  if (o.called) {
    const regular = clamp(0.45 + (o.ox - 72) / 30, 0.3, 1);
    const mine = ARG_PW + clamp((o.ox - 82) * 0.2, -2.5, 3);
    let games = r.int(5, 9); // eliminatorias y amistosos
    const tour = natTournament(o.year);
    const run = tour ? runTournament(mine, tour.t, r, 1, tour.t.name) : null;
    if (run) games += run.matches;
    const fin = isFinalissimaYear(o.year) ? r.chance(sig((mine - INTL.finalissima.lo) / SCALE)) : null;
    if (fin !== null) games += 1;
    out.caps = Math.max(1, Math.round(games * regular * part));
    out.capGoals = r.poisson(out.caps * o.capG * clamp(Math.exp((o.ox - 78) / 20), 0.4, 1.8));
    out.lines.push(`👕 Jugaste ${out.caps} ${out.caps === 1 ? 'partido' : 'partidos'} con la Selección${out.capGoals ? ` y metiste ${out.capGoals}` : ''}.`);
    if (run && tour) {
      if (run.won) { out.lines.push(`🌎 ¡Fuiste campeón con la Selección en ${tour.name === 'el Mundial' ? 'el Mundial' : 'la Copa América'}!`); }
      else out.lines.push(`🌎 La Selección quedó eliminada ${eliminatedAt(tour.t.rounds[run.round])} ${tour.name === 'el Mundial' ? 'del Mundial' : 'de la Copa América'}.`);
      if (run.won && out.caps >= 3) { out.trophies.push(tour.t.name); if (tour.t === INTL.worldCup) out.wc = true; else out.copa = true; }
    }
    if (fin === true && out.caps >= 3) { out.trophies.push(INTL.finalissima.name); out.lines.push('🏆 La Selección ganó la Finalissima.'); }
  }
  if (o.oly) {
    const mine = ARG_U23_PW + clamp((o.ox - 66) * 0.25, -2, 5);
    const run = runTournament(mine, INTL.olympics, r, 1, INTL.olympics.name);
    const n = Math.max(1, Math.round(run.matches * part * clamp(0.5 + (o.ox - 68) / 30, 0.4, 1)));
    const g = r.poisson(n * o.capG * 1.2);
    out.caps += n; out.capGoals += g;
    out.lines.push(`🥇 Jugaste ${n} ${n === 1 ? 'partido' : 'partidos'} en los Juegos Olímpicos${g ? ` y metiste ${g}` : ''}.`);
    if (run.won) out.lines.push('🥇 ¡Ganaste la medalla de oro olímpica!');
    else out.lines.push(`La Sub-23 quedó eliminada ${eliminatedAt(INTL.olympics.rounds[run.round])} de los Juegos.`);
    if (run.won && n >= 3) { out.trophies.push(INTL.olympics.name); out.oly = true; }
  }
  return out;
}

// ---------- Premios individuales ----------

export interface AwardCtx {
  club: Club; age: number; pos: Pos; pj: number; avail: number; goals: number; assists: number; rating: number; ox: number;
  rank: number; champion: boolean; cont: (Run & { id: ContId }) | null; wc: boolean; copa: boolean;
}

const TOP5: readonly LeagueId[] = ['en', 'es', 'it', 'de', 'fr'];

/** Premios individuales de la temporada: de la liga, de las copas, de Europa, el Balón de Oro y los argentinos. */
export function seasonAwards(x: AwardCtx, r: Rng): string[] {
  const out: string[] = [];
  const { club, pos, pj, goals, assists, rating, ox, champion } = x;
  const L = LEAGUES[club.lg], tier = club.tier, lg = club.lg;
  const gThr = Math.round(x.avail * GOAL_RATE[tier]), aThr = Math.round(x.avail * ASSIST_RATE[tier]);
  const plays = pj >= Math.max(10, L.games * 0.45);
  const regular = pj >= L.games * 0.65;
  const europe = L.conf === 'uefa';

  if (plays) {
    if (goals >= gThr && r.chance(goals >= gThr * 1.3 ? 0.9 : 0.6)) out.push(lgAward.scorer(lg));
    if (assists >= aThr && r.chance(assists >= aThr * 1.3 ? 0.9 : 0.6)) out.push(lgAward.assist(lg));
    if (pos === 'ARQ' && tier >= 1 && rating >= 7.5 && r.chance(clamp((rating - 7.2) * 0.6, 0, 0.7))) out.push(lgAward.keeper(lg));
    if (pos === 'DEF' && tier >= 1 && rating >= 7.5 && r.chance(clamp((rating - 7.2) * 0.6, 0, 0.7))) out.push(lgAward.defender(lg));
    if (x.age <= 21 && tier >= 1 && rating >= 7.0 && r.chance(0.55)) out.push(lgAward.rookie(lg));
  }
  if (regular && tier >= 1 && rating >= 7.9 && r.chance(clamp((rating - 7.7) * 0.5 + (champion ? 0.1 : 0), 0, 0.7))) out.push(lgAward.best(lg));

  // Europa: Bota de Oro (el goleador de las cinco grandes ligas) y Golden Boy (sub-21)
  if (TOP5.includes(lg) && out.includes(lgAward.scorer(lg)) && r.chance(goals >= gThr * 1.25 ? 0.5 : 0.25)) out.push(AWARD.boot);
  if (europe && x.age <= 21 && regular && rating >= 7.3 && r.chance(0.5)) out.push(AWARD.golden);

  // Balón de Oro: club grande de Europa, gran temporada, y casi siempre un título. Los 3 primeros del podio suman.
  const contWon = x.cont?.won ? x.cont.id : null;
  if (europe && tier >= 4 && regular && ox >= 84 && rating >= 7.8) {
    const titles = (champion ? 0.2 : 0) + (contWon === 'cl' ? 0.55 : contWon ? 0.2 : 0) + (x.wc ? 0.7 : 0) + (x.copa ? 0.3 : 0) + (tier === 5 ? 0.1 : -0.1);
    const s = (rating - 7.6) + (ox - 84) * 0.035 + titles + r.normal(0, 0.2);
    const rivals = [0.55, 0.4, 0.28, 0.16, 0.05].map(m => r.normal(m, 0.22));
    const place = 1 + rivals.filter(v => v > s).length;
    if (place === 1) out.push(AWARD.ballon);
    else if (place === 2) out.push(AWARD.ballon2);
    else if (place === 3) out.push(AWARD.ballon3);
  }

  // Premio Puskás: un golazo, muy raro
  if (pj >= 8 && goals >= 3 && r.chance(pos === 'DEL' || pos === 'MED' ? 0.012 : 0.005)) out.push(AWARD.puskas);

  // Premios argentinos
  if (lg === 'ar1' && regular && rating >= 7.7 && r.chance(clamp((rating - 7.5) * 0.5, 0, 0.6))) out.push(AWARD.olimpiaPlata);
  if ((x.wc && ox >= 78 && r.chance(0.35)) || (lg === 'ar1' && champion && rating >= 8.3 && r.chance(0.2))) out.push(AWARD.olimpiaOro);

  // Figuras de las copas
  if (x.cont && x.cont.won && rating >= 7.5 && r.chance(0.4)) out.push(contMvp(CONTS[x.cont.id].name));
  else if (x.cont && !x.cont.won && x.cont.round === CONTS[x.cont.id].rounds.length - 1 && rating >= 7.8 && r.chance(0.1)) out.push(contMvp(CONTS[x.cont.id].name));
  if (x.wc && ox >= 80 && rating >= 7.5 && r.chance(0.4)) out.push(AWARD.wcStar);
  if (x.copa && ox >= 78 && rating >= 7.5 && r.chance(0.3)) out.push(AWARD.caStar);
  return out;
}

