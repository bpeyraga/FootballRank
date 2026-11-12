// "De potrero a leyenda": las reglas del simulador de carrera. Funciones puras sobre un estado serializable (JSON), con semilla:
// mismo seed + mismas decisiones = misma carrera. No toca el DOM, el storage ni Supabase.
import { ATTRS, POS, type Pos, type Stats } from '../../shared/model';
import {
  AWARD, AWARD_PTS, DECLINE_W, LEGACY_STEPS, PEAK_TIER_PTS, POS_LABEL, POS_RATE, POS_START, POS_W, STYLES, TIER_WEIGHT, TROPHY_PTS, type StyleDef,
} from './careerData';
import {
  DEFAULT_YEAR, MAX_AGE, MAX_STAT, MIN_STAT, RETIRE_FROM, START_AGE, ageCurve, careerOvr, clamp, ovrF, remainingGrowth, roleLabel, round1, seasonYear,
} from './careerBase';
import { CHAMP_NEXT, CWC_CONTS, cupRun, eliminatedAt, nationalSeason, runTournament, seasonAwards, type Run } from './careerComps';
import { drawEvents } from './careerEvents';
import { Rng, seedState } from './careerRng';
import type { Best, Career, ContId, EventInst, Fx, Legacy, LeagueId, Mods, NewCareerOpts, SeasonLog, Severity, Totals } from './careerTypes';
import {
  CLUB_BY_NAME, CONTS, INTL, LEAGUES, betterCont, finishRank, homePool, isCont, isClubWorldCupYear, isLeague, leagueAvg, qualByStrength, qualFor,
  sizeOf, tierOf, youthClub,
} from './careerWorld';

export { ageCurve, careerOvr, cardTier, MAX_AGE, MAX_STAT, MIN_STAT, RETIRE_FROM, START_AGE } from './careerBase';
export { fxTags } from './careerEvents';
export * from './careerTypes';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const NO_MODS: Mods = { growth: 0, injury: 0, minutes: 0, form: 0, team: 0, cap: false, oly: false };
const styleOf = (id: string): StyleDef => STYLES.find(s => s.id === id) ?? STYLES[0];
const HOME_POOL = homePool();

// ---------- Arranque ----------

/** Desplaza todas las stats parejo hasta que el OVR del puesto dé `target`. */
function fitTo(s: Stats, pos: Pos, target: number): Stats {
  const out = { ...s };
  for (let i = 0; i < 4; i++) {
    const d = target - ovrF(out, pos);
    if (Math.abs(d) < 0.05) break;
    for (const [k] of ATTRS) out[k] = clamp(out[k] + d, MIN_STAT, MAX_STAT);
  }
  for (const [k] of ATTRS) out[k] = round1(out[k]);
  return out;
}

function startStats(r: Rng, pos: Pos, style: StyleDef, target: number): Stats {
  const raw = {} as Stats;
  for (const [k] of ATTRS) raw[k] = 50 + POS_START[pos][k] + style.start[k] + r.range(-3, 3);
  return fitTo(raw, pos, target);
}

/** OVR con el que arrancarías a los 17 si traés tu carta (el promedio de tus stats reales, achicado). */
export const youthTarget = (avg: number) => 44 + (avg - 50) * 0.35;

/** La carta real de la app, en versión pibe: stats achicadas hasta ~45-60 de OVR. A más OVR real, más potencial. */
export function cardStart(real: Stats, pos: Pos, r: Rng): { stats: Stats; potential: number } {
  const clean = {} as Stats;
  for (const [k] of ATTRS) clean[k] = clamp(Number.isFinite(real[k]) ? real[k] : 50, MIN_STAT, MAX_STAT);
  const avg = ATTRS.reduce((t, [k]) => t + clean[k], 0) / ATTRS.length;
  const target = clamp(Math.round(youthTarget(avg) + r.range(-1.5, 1.5)), 45, 60);
  const scaled = {} as Stats;
  for (const [k] of ATTRS) scaled[k] = clamp(clean[k] * (target / Math.max(avg, 1)), MIN_STAT, MAX_STAT);
  const potential = clamp(Math.round(r.normal(70, 6) + (avg - 60) * 0.45), 60, 97);
  return { stats: fitTo(scaled, pos, target), potential };
}

/** Arranca una carrera: 17 años, inferiores de un club argentino real, primera decisión lista. */
export function newCareer(o: NewCareerOpts): Career {
  const r = new Rng(seedState(o.seed));
  const style = styleOf(o.style);
  const pos: Pos = POS.includes(o.pos) ? o.pos : 'MED';
  let stats: Stats, potential: number;
  if (o.card) ({ stats, potential } = cardStart(o.card, pos, r));
  else {
    potential = clamp(Math.round(r.normal(72, 8.5)), 56, 96);
    stats = startStats(r, pos, style, clamp(Math.round(r.normal(52, 3.5)), 45, 60));
  }
  const ovr0 = careerOvr(stats, pos);
  potential = Math.max(potential, ovr0 + 6);
  const home = r.weighted(HOME_POOL) ?? HOME_POOL[0][0];
  const y0 = typeof o.year === 'number' && Number.isInteger(o.year) && o.year >= 1900 && o.year <= 2200 ? o.year : DEFAULT_YEAR;
  const base: Career = {
    v: 2, seed: o.seed >>> 0, rng: r.s, y0, name: o.name.trim().slice(0, 24) || 'Crack', pos, style: style.id, fromCard: !!o.card,
    stats, potential, rate: (potential - ovr0) / remainingGrowth(START_AGE), age: START_AGE,
    club: youthClub(home), home: home.name, loan: null, qual: null, stint: 0, captain: false, trust: 0, returned: false, returning: false, lastInjury: null,
    phase: 'decide', queue: [], mods: { ...NO_MODS }, notes: [], picks: [], history: [], retire: null,
  };
  const c = startSeason(base, r);
  c.notes.push(`Arrancás en las inferiores de ${home.name}.`);
  return c;
}

/** Prepara la temporada que viene: vuelta del préstamo, nuevas decisiones y modificadores en cero. */
function startSeason(c0: Career, r: Rng): Career {
  const c = clone(c0);
  c.notes = [];
  c.picks = [];
  if (c.loan) {
    c.notes.push(`Volvés a ${c.loan.name} después del préstamo.`);
    c.club = c.loan; c.loan = null; c.stint = 0; c.captain = false; c.trust = 0;
    c.qual = qualByStrength(c.club);
  }
  c.mods = { ...NO_MODS };
  c.queue = drawEvents(c, r);
  c.lastInjury = null;
  c.phase = 'decide';
  c.rng = r.s;
  return c;
}

// ---------- Decisiones ----------

function applyFx(c: Career, fx: Fx, r: Rng) {
  const m = c.mods;
  m.growth += fx.growth ?? 0; m.injury += fx.injury ?? 0; m.minutes += fx.minutes ?? 0; m.form += fx.form ?? 0; m.team += fx.team ?? 0;
  if (fx.cap !== undefined) m.cap = fx.cap;
  if (fx.oly !== undefined) m.oly = fx.oly;
  if (fx.trust) c.trust = clamp(c.trust + fx.trust, -2, 2);
  if (fx.captain) c.captain = true;
  if (fx.pos && fx.pos !== c.pos) { c.pos = fx.pos; c.notes.push(`Pasás a jugar de ${POS_LABEL[fx.pos].toLowerCase()}.`); }
  if (fx.stat) for (const [k] of ATTRS) if (fx.stat[k]) c.stats[k] = round1(clamp(c.stats[k] + fx.stat[k]!, MIN_STAT, MAX_STAT));
  if (fx.move) {
    const { club, kind } = fx.move;
    if (kind === 'loan') { c.loan = c.loan ?? { ...c.club }; c.notes.push(`Te vas cedido a ${club.name}.`); }
    else {
      c.loan = null;
      if (kind === 'return') c.notes.push(`Volvés a ${club.name}, el club de tus inferiores.`);
      else if (club.name !== c.club.name) c.notes.push(`Firmás con ${club.name} (${LEAGUES[club.lg].name}).`);
    }
    // La vuelta a casa cuenta para el Legado recién cuando se juega esa temporada (ver playSeason): si te retirás antes, no suma.
    c.returning = kind === 'return';
    c.club = { ...club }; c.stint = 0; c.captain = false; c.trust = 0;
    c.qual = qualByStrength(club);
  }
  if (fx.gamble) {
    const ok = r.chance(fx.gamble.p);
    const text = ok ? fx.gamble.okText : fx.gamble.badText;
    if (text) c.notes.push(text);
    const out = ok ? fx.gamble.ok : fx.gamble.bad;
    if (out) applyFx(c, { ...out, gamble: undefined }, r);
  }
}

/** Elegís una opción de la decisión actual. Con la última, se juega la temporada. */
export function choose(c0: Career, optionId: string): Career {
  if (c0.phase !== 'decide' || !c0.queue.length) return c0;
  const opt = c0.queue[0].options.find(o => o.id === optionId);
  if (!opt) return c0;
  const c = clone(c0);
  const r = new Rng(c.rng);
  applyFx(c, opt.fx, r);
  c.picks.push(opt.label);
  c.queue.shift();
  if (!c.queue.length) playSeason(c, r);
  c.rng = r.s;
  return c;
}

/** Desde los 32 podés colgar los botines en vez de seguir. */
export const canRetire = (c: Career) => c.phase === 'decide' && c.age >= RETIRE_FROM && c.history.length > 0;

export function retireNow(c0: Career): Career {
  if (!canRetire(c0)) return c0;
  const c = clone(c0);
  c.phase = 'over'; c.retire = 'elegido'; c.queue = [];
  return c;
}

/** Del resultado de la temporada a la siguiente (o, si te retirás, al cierre de la carrera). */
export function advance(c0: Career): Career {
  if (c0.phase !== 'result') return c0;
  const c = clone(c0);
  if (c.retire) { c.phase = 'over'; c.queue = []; return c; }
  return startSeason(c, new Rng(c.rng));
}

/** La decisión que toca ahora (o null si no hay). */
export const currentEvent = (c: Career): EventInst | null => (c.phase === 'decide' ? c.queue[0] ?? null : null);

// ---------- La temporada ----------

/** Mínimo de OVR para seguir jugando a esa edad: pasados los 31 el piso sube año a año. */
export const retireFloor = (age: number) => (age < 31 ? 0 : 48 + (age - 31) * 2.8);

/** Nota base por puesto: compensa que los delanteros suman más con los goles. */
const RATING_BASE: Record<Pos, number> = { DEL: 6.6, MED: 6.85, DEF: 6.8, ARQ: 6.85 };
const INJ_BASE = (age: number) => (age <= 22 ? 0.10 : age <= 28 ? 0.12 : age <= 31 ? 0.15 : age <= 34 ? 0.19 : 0.24);
const MISSED: Record<Severity, number> = { leve: 0.12, media: 0.35, grave: 0.65 };

/** Reparte un cambio de OVR entre las stats: crecen las de tu estilo y puesto, caen primero ritmo y físico. */
function applyOvrDelta(c: Career, delta: number, r: Rng) {
  const style = styleOf(c.style), w = POS_W[c.pos], s = c.stats;
  const a = {} as Stats;
  for (const [k] of ATTRS) a[k] = (delta >= 0 ? Math.sqrt(w[k]) * style.grow[k] : DECLINE_W[k] * (0.6 + Math.sqrt(w[k]))) * r.range(0.8, 1.2);
  let left = delta;
  for (let pass = 0; pass < 3 && Math.abs(left) > 0.01; pass++) {
    const free = ATTRS.filter(([k]) => (left > 0 ? s[k] < MAX_STAT : s[k] > MIN_STAT));
    const denom = free.reduce((t, [k]) => t + a[k] * w[k], 0);
    if (!free.length || denom <= 0) break;
    const f = left / denom;
    for (const [k] of free) { const old = s[k]; s[k] = clamp(old + a[k] * f, MIN_STAT, MAX_STAT); left -= w[k] * (s[k] - old); }
  }
  for (const [k] of ATTRS) s[k] = round1(s[k]);
}

/** Qué copa continental jugás el año que viene: la que te da la tabla de este año, la copa nacional o tu título continental (la mejor). */
function nextQual(c: Career, lg: LeagueId, rank: number, cupWon: boolean, cont: Run | null, played: ContId | null): ContId | null {
  if (c.loan || lg === 'inf') return null;
  let q = betterCont(qualFor(lg, rank), cupWon ? LEAGUES[lg].cupQual : null);
  if (cont?.won && played) q = betterCont(q, CHAMP_NEXT[played]);
  return q;
}

function playSeason(c: Career, r: Rng) {
  const m = c.mods, club = c.club, tier = club.tier, age = c.age, style = styleOf(c.style);
  const L = LEAGUES[club.lg], year = seasonYear(c);
  const ovr0 = careerOvr(c.stats, c.pos), ox = ovrF(c.stats, c.pos);
  const level = club.pw;
  const lines: string[] = [...c.notes];

  // Minutos: tu nivel contra el del club, más lo que decidiste y lo que te quiere el DT
  const diff = ox - level + m.minutes * 4 + c.trust * 1.5 + (c.captain ? 1.5 : 0) + r.normal(0, 3);
  const share = clamp(0.55 + diff / 18, 0.04, 1);

  // Lesiones
  const pInj = clamp((INJ_BASE(age) + m.injury) * style.injury + (share > 0.8 ? 0.01 : 0), 0.02, 0.6);
  let injury: Severity | null = null, missed = 0;
  if (r.chance(pInj)) {
    const pGrave = clamp(0.08 + Math.max(0, age - 25) * 0.008, 0.08, 0.2);
    const x = r.next();
    injury = x < pGrave ? 'grave' : x < pGrave + 0.32 ? 'media' : 'leve';
    missed = MISSED[injury] * r.range(0.8, 1.2);
  }

  // El equipo: lo que aportás suma a la fuerza del club, en la liga, la copa nacional y la copa continental
  const impact = clamp((ox - level) * 0.22, -3, 6) * (0.4 + 0.6 * share) * (1 - missed * 0.5);
  const boost = impact + m.team * 10 + (c.captain ? 0.4 : 0);
  const rank = finishRank(club, boost, r);
  const cup = cupRun(club, boost, r);
  const qual = c.qual && CONTS[c.qual].conf === L.conf ? c.qual : null;
  const cont = qual ? runTournament(club.pw + boost, CONTS[qual], r, 2, CONTS[qual].name) : null;
  const prev = c.history[c.history.length - 1];
  const cwc = isClubWorldCupYear(year) && prev && prev.club === club.name && CWC_CONTS.some(id => prev.trophies.includes(CONTS[id].name))
    ? runTournament(club.pw + boost, INTL.clubWorldCup, r, 1, INTL.clubWorldCup.name) : null;
  const avail = L.games + (cup?.matches ?? 0) + (cont?.matches ?? 0) + (cwc?.matches ?? 0);

  const pj = clamp(Math.round(avail * share * (1 - missed) * r.range(0.92, 1.04)), 0, avail);
  if (injury) {
    const out = Math.round(avail * share * missed);
    lines.push(injury === 'grave' ? `🏥 Una lesión grave te dejó afuera casi toda la temporada.` : `🩹 Una lesión ${injury} te tuvo afuera ${Math.max(1, out)} partidos.`);
  }

  // Goles, asistencias, vallas invictas y nota
  const q = clamp(Math.exp((ox - level) / 20), 0.35, 2.2);
  const rate = POS_RATE[c.pos];
  const gq = q * clamp(1 + (c.stats.tir - ox) / 60, 0.7, 1.4) * (1 + m.form * 0.5);
  const aq = q * clamp(1 + (c.stats.pas - ox) / 60, 0.7, 1.4) * (1 + m.form * 0.5);
  const goals = r.poisson(pj * rate.g * gq);
  const assists = r.poisson(pj * rate.a * aq);
  const teamQ = clamp((ox - level) / 28 + (club.pw - leagueAvg(club.lg)) / 50 + m.team + (c.captain ? 0.03 : 0), -0.4, 1);
  const cs = c.pos === 'ARQ' || c.pos === 'DEF' ? r.binomial(pj, clamp(0.26 + 0.12 * teamQ, 0.08, 0.6)) : 0;
  let rating = 0;
  if (pj > 0) {
    rating = RATING_BASE[c.pos] + clamp((ox - level) / 13, -1.5, 1.7) + m.form + (share - 0.5) * 0.4 + r.normal(0, 0.28) + ((goals + assists * 0.6) / pj) * 0.9 + (cs / pj) * 0.8;
    rating = round1(clamp(rating, 5.2, 9.6));
  }

  // Títulos del equipo (si jugaste lo suficiente como para contarlos)
  const trophies: string[] = [];
  const credit = pj >= 8;
  const champion = rank === 1;
  if (champion && credit) trophies.push(L.name);
  if (cup?.won && credit) trophies.push(cup.cup);
  if (cont?.won && credit && qual) trophies.push(CONTS[qual].name);
  if (cwc?.won && credit) trophies.push(INTL.clubWorldCup.name);
  if (cup && !cup.won && cup.round === L.cupRounds - 1) lines.push(`🥈 Tu equipo perdió la final de la ${cup.cup}.`);
  if (cont && qual) {
    lines.push(cont.won ? `🌎 ¡Ganaste la ${CONTS[qual].name} con ${club.name}!` : `🌎 ${CONTS[qual].name}: tu equipo quedó eliminado ${eliminatedAt(CONTS[qual].rounds[cont.round])}.`);
  }
  if (cwc) lines.push(cwc.won ? '🌍 ¡Ganaste el Mundial de Clubes!' : `🌍 Mundial de Clubes: tu equipo quedó eliminado ${eliminatedAt(INTL.clubWorldCup.rounds[cwc.round])}.`);

  // Selección y Juegos Olímpicos
  const nat = nationalSeason({ year, ox, missed, capG: rate.capG, called: m.cap, oly: m.oly }, r);
  trophies.push(...nat.trophies);
  lines.push(...nat.lines);

  // Ascensos y descensos de la Argentina
  let next = club;
  if (club.lg === 'ar2' && !c.loan && rank <= 2) {
    next = { ...club, lg: 'ar1', pw: club.pw + 3, tier: tierOf(club.pw + 3) };
    lines.push(`⬆️ ¡${club.name} ascendió a la ${LEAGUES.ar1.name}!`);
  } else if (club.lg === 'ar1' && !c.loan && rank > sizeOf('ar1') - 3) {
    next = { ...club, lg: 'ar2', pw: club.pw - 3, tier: tierOf(club.pw - 3) };
    lines.push(`⬇️ ${club.name} descendió a la ${LEAGUES.ar2.name}.`);
  }

  // Premios individuales
  const awards = seasonAwards({
    club, age, pos: c.pos, pj, avail, goals, assists, rating, ox, rank, champion, wc: nat.wc, copa: nat.copa,
    cont: cont && qual ? { ...cont, id: qual } : null,
  }, r);

  // Cómo cambia tu OVR (la curva de edad, tu ritmo de crecimiento, lo que jugaste y lo que decidiste)
  const curve = ageCurve(age);
  let delta: number;
  if (curve > 0) delta = curve * c.rate + (share - 0.5) * 1.1;
  else delta = curve * style.decline * (1 + Math.max(0, age - 33) * 0.04) + (share - 0.5) * 0.3;
  delta += m.growth + clamp(r.normal(0, 0.8), -2, 2);
  if (injury === 'grave') delta -= (1 + r.range(0, 1.5)) * (1 + Math.max(0, age - 28) * 0.06);
  else if (injury === 'media') delta -= 0.3;
  delta = clamp(delta, -9, 8);
  if (delta > 0 && ox + delta > c.potential + 2) delta = Math.max(0, c.potential + 2 - ox);
  applyOvrDelta(c, delta, r);
  const ovr1 = careerOvr(c.stats, c.pos);

  const caps = nat.caps;
  c.history.push({
    n: c.history.length + 1, age, club: club.name, tier, lg: club.lg, fin: rank, cont: qual ? CONTS[qual].name : '', ovr0, ovr: ovr1, pj, goals, assists, cs, rating,
    role: roleLabel(pj > 0 ? share : 0), trophies, awards, caps, capGoals: nat.capGoals, injury, captain: c.captain, picks: [...c.picks], lines,
  });
  c.stint += 1;
  if (c.returning) { c.returned = true; c.returning = false; }
  c.lastInjury = injury;
  c.qual = next !== club && next.lg === 'ar2' ? null : nextQual(c, club.lg, rank, !!cup?.won, cont, qual);
  c.club = next;
  c.age = age + 1;
  c.retire = c.age >= MAX_AGE ? 'edad'
    : (c.age >= 31 && ovr1 < retireFloor(c.age)) || (injury === 'grave' && c.age >= 34 && r.chance(0.4)) ? 'fisico' : null;
  c.phase = 'result';
  c.queue = [];
  c.notes = lines;
}

// ---------- Resumen, Legado y compartir ----------

export function totals(c: Career): Totals {
  const h = c.history;
  const sum = (f: (s: Career['history'][number]) => number) => h.reduce((t, s) => t + f(s), 0);
  return {
    seasons: h.length, clubs: new Set(h.map(s => s.club)).size,
    pj: sum(s => s.pj), goals: sum(s => s.goals), assists: sum(s => s.assists), cs: sum(s => s.cs),
    trophies: sum(s => s.trophies.length), caps: sum(s => s.caps), capGoals: sum(s => s.capGoals),
    peak: h.reduce<number>((t, s) => Math.max(t, s.ovr0, s.ovr), 0),
    peakTier: h.reduce<number>((t, s) => (s.pj >= 10 ? Math.max(t, s.tier) : t), 0) as Totals['peakTier'],
    awards: sum(s => s.awards.length), captainSeasons: h.filter(s => s.captain).length,
    bestRating: h.reduce<number>((t, s) => Math.max(t, s.rating), 0),
  };
}

/** Puntos por producción según el puesto (un gol de arquero o defensor vale mucho más que uno de delantero). */
const PROD: Record<Pos, { g: number; a: number; cs: number }> = {
  DEL: { g: 0.15, a: 0.10, cs: 0 }, MED: { g: 0.5, a: 0.22, cs: 0 }, DEF: { g: 0.7, a: 0.35, cs: 0.08 }, ARQ: { g: 3, a: 2, cs: 0.14 },
};

/** Puntaje de Legado: pico de OVR, títulos, premios, categoría alcanzada, producción, Selección, longevidad y lealtad. */
export function legacyScore(c: Career): number {
  const t = totals(c);
  const p = PROD[c.pos];
  let pts = Math.max(0, t.peak - 58) * 2.2 + PEAK_TIER_PTS[t.peakTier];
  for (const h of c.history) {
    const w = TIER_WEIGHT[h.tier] ?? 1;
    for (const x of h.trophies) pts += TROPHY_PTS[x] ?? 4;
    for (const x of h.awards) pts += (AWARD_PTS[x] ?? 4) * w;
    pts += (h.goals * p.g + h.assists * p.a + h.cs * p.cs) * w;
  }
  pts += t.caps * 0.8 + t.capGoals * 1.2 + t.pj * 0.04 + t.captainSeasons * 1.5;
  // Lealtad: 8 o más temporadas seguidas en un mismo club
  let run = 0, best = 0, prev = '';
  for (const h of c.history) { run = h.club === prev ? run + 1 : 1; prev = h.club; best = Math.max(best, run); }
  if (best >= 8) pts += 10;
  if (c.returned) pts += 8;
  return Math.round(pts);
}

export function legacyOf(score: number): Legacy {
  let index = 0;
  LEGACY_STEPS.forEach((s, i) => { if (score >= s.min) index = i; });
  return { score, label: LEGACY_STEPS[index].label, index };
}
export const legacy = (c: Career): Legacy => legacyOf(legacyScore(c));
export const legacyBlurb = (index: number) => LEGACY_STEPS[clamp(index, 0, LEGACY_STEPS.length - 1)].blurb;

/** Texto para compartir (WhatsApp y compañía). */
export function shareText(c: Career, url: string): string {
  const t = totals(c), l = legacy(c);
  const prod = c.pos === 'ARQ' || c.pos === 'DEF' ? `🧤 ${t.cs} vallas invictas` : `⚽ ${t.goals} goles · 🅰️ ${t.assists} asistencias`;
  return [
    '🎮 De potrero a leyenda · El Partidito',
    `${c.name} (${c.pos}): ${l.label}, ${l.score} pts de Legado`,
    `📅 ${t.seasons} temporadas · ${t.clubs} ${t.clubs === 1 ? 'club' : 'clubes'} · ${t.pj} partidos`,
    prod,
    `🏆 ${t.trophies} ${t.trophies === 1 ? 'título' : 'títulos'}${t.awards ? ` · ⭐ ${t.awards} ${t.awards === 1 ? 'premio' : 'premios'}` : ''}`,
    t.caps ? `👕 ${t.caps} partidos en la Selección (${t.capGoals} goles)` : null,
    `📈 OVR máximo: ${t.peak}`,
    `¿Llegás más lejos que yo? ${url}`,
  ].filter(Boolean).join('\n');
}

/** Cuenta repetidos y ordena lo más valioso primero: [["Liga Profesional", 3], …]. */
export function tally(names: readonly string[], pts: Record<string, number> = {}): [string, number][] {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m].sort((a, b) => (pts[b[0]] ?? 0) - (pts[a[0]] ?? 0) || b[1] - a[1]);
}

/** El titular de la temporada, según lo que pasó. */
export function seasonTitle(h: SeasonLog): string {
  if (h.awards.includes(AWARD.ballon)) return '¡Ganaste el Balón de Oro!';
  if (h.trophies.includes(INTL.worldCup.name)) return '¡Campeón del mundo!';
  if (h.trophies.includes(CONTS.cl.name)) return '¡Campeón de Europa!';
  if (h.trophies.includes(CONTS.lib.name)) return '¡Campeón de América!';
  if (h.trophies.includes(INTL.copaAmerica.name) || h.trophies.includes(INTL.olympics.name)) return '¡Campeón con la Selección!';
  if (h.trophies.length >= 2) return 'Temporada de ensueño';
  if (h.trophies.length === 1) return '¡Saliste campeón!';
  if (h.injury === 'grave') return 'Un año para el olvido';
  if (h.pj < 6) return 'Casi no jugaste';
  if (h.rating >= 8) return 'Una temporada brillante';
  if (h.rating >= 7.2) return 'Una buena temporada';
  return 'Una temporada pareja';
}

/** De 1 a 5 estrellas: lo que dicen los ojeadores de hasta dónde podés llegar. */
export const potentialStars = (potential: number): number => (potential < 66 ? 1 : potential < 73 ? 2 : potential < 80 ? 3 : potential < 87 ? 4 : 5);

// ---------- Guardado ----------

/** Resumen de una carrera terminada, para guardar la mejor. */
export function bestOf(c: Career): Best {
  const t = totals(c), l = legacy(c);
  return { v: 2, seed: c.seed, name: c.name, pos: c.pos, label: l.label, score: l.score, peak: t.peak, seasons: t.seasons, trophies: t.trophies };
}

export function parseBest(raw: unknown): Best | null {
  try {
    const b = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Best | null;
    if (!b || typeof b !== 'object' || b.v !== 2 || typeof b.name !== 'string' || typeof b.label !== 'string' || !POS.includes(b.pos)) return null;
    if (![b.seed, b.score, b.peak, b.seasons, b.trophies].every(finite)) return null;
    return b;
  } catch { return null; }
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// Lo que se lee del storage puede venir viejo, a medio guardar o tocado a mano: se valida todo lo que la pantalla después da por hecho,
// para que una carrera rota arranque de cero en vez de tirar la pantalla abajo.
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isStrs = (x: unknown): x is string[] => Array.isArray(x) && x.every(s => typeof s === 'string');
const isTier = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 5;
const SEVERITIES: readonly string[] = ['leve', 'media', 'grave'];
const RETIRES: readonly string[] = ['elegido', 'edad', 'fisico'];
const FX_NUMS = ['growth', 'injury', 'minutes', 'form', 'team', 'trust'] as const;

/** Un club tiene que existir en el mundo del juego (o ser las inferiores de uno) y la categoría tiene que cuadrar con su fuerza. */
function validClub(x: unknown): boolean {
  if (!isObj(x) || typeof x.name !== 'string' || !isLeague(x.lg) || !finite(x.pw) || !isTier(x.tier)) return false;
  if (!CLUB_BY_NAME.has(x.name)) return false;
  return x.lg === 'inf' ? x.tier === 0 && x.pw >= 40 && x.pw <= 62 : x.tier === tierOf(x.pw) && x.pw >= 40 && x.pw <= 99;
}

function validFx(x: unknown, depth = 0): boolean {
  if (!isObj(x) || depth > 3) return false;
  if (FX_NUMS.some(k => x[k] !== undefined && !finite(x[k]))) return false;
  if (['cap', 'oly', 'captain'].some(k => x[k] !== undefined && typeof x[k] !== 'boolean')) return false;
  if (x.pos !== undefined && !POS.includes(x.pos as Pos)) return false;
  if (x.stat !== undefined && (!isObj(x.stat) || Object.values(x.stat).some(v => !finite(v)))) return false;
  if (x.move !== undefined && !(isObj(x.move) && validClub(x.move.club) && ['transfer', 'loan', 'return'].includes(x.move.kind as string))) return false;
  if (x.gamble !== undefined) {
    const g = x.gamble;
    if (!isObj(g) || !finite(g.p) || typeof g.okText !== 'string' || typeof g.badText !== 'string') return false;
    if ((g.ok !== undefined && !validFx(g.ok, depth + 1)) || (g.bad !== undefined && !validFx(g.bad, depth + 1))) return false;
  }
  return true;
}

const validEvent = (e: unknown): boolean =>
  isObj(e) && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.text === 'string' && Array.isArray(e.options) && e.options.length > 0
  && e.options.every(o => isObj(o) && typeof o.id === 'string' && typeof o.label === 'string' && typeof o.hint === 'string' && validFx(o.fx));

const validLog = (h: unknown): boolean =>
  isObj(h) && [h.n, h.age, h.ovr0, h.ovr, h.pj, h.goals, h.assists, h.cs, h.rating, h.caps, h.capGoals, h.fin].every(finite) && isTier(h.tier) && isLeague(h.lg)
  && typeof h.club === 'string' && typeof h.cont === 'string' && typeof h.role === 'string' && typeof h.captain === 'boolean'
  && isStrs(h.trophies) && isStrs(h.awards) && isStrs(h.picks) && isStrs(h.lines) && (h.injury === null || SEVERITIES.includes(h.injury as string));

/** Valida una carrera leída del storage (puede venir vieja, rota o tocada a mano). null si no sirve. Las de la versión 1 (clubes inventados) se descartan. */
export function parseCareer(raw: unknown): Career | null {
  try {
    const c = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Career | null;
    if (!isObj(c) || c.v !== 2) return null;
    if (!finite(c.seed) || !finite(c.rng) || !finite(c.potential) || !finite(c.rate) || !finite(c.stint) || !finite(c.trust)) return null;
    if (!Number.isInteger(c.y0) || c.y0 < 1900 || c.y0 > 2200) return null;
    if (!Number.isInteger(c.age) || c.age < START_AGE || c.age > MAX_AGE) return null;
    if (typeof c.name !== 'string' || !POS.includes(c.pos) || !STYLES.some(s => s.id === c.style)) return null;
    if (!['decide', 'result', 'over'].includes(c.phase)) return null;
    if (typeof c.fromCard !== 'boolean' || typeof c.captain !== 'boolean' || typeof c.returned !== 'boolean') return null;
    if (c.returning !== undefined && typeof c.returning !== 'boolean') return null;
    if (c.lastInjury !== null && !SEVERITIES.includes(c.lastInjury as string)) return null;
    if (c.retire !== null && !RETIRES.includes(c.retire as string)) return null;
    if (!isObj(c.stats) || ATTRS.some(([k]) => !finite(c.stats[k]))) return null;
    if (!validClub(c.club) || (c.loan !== null && !validClub(c.loan))) return null;
    if (typeof c.home !== 'string' || !CLUB_BY_NAME.has(c.home)) return null;
    // La copa continental tiene que ser de la confederación del club (nada de Libertadores para un club europeo)
    if (c.qual !== null && (!isCont(c.qual) || CONTS[c.qual].conf !== LEAGUES[c.club.lg].conf)) return null;
    if (!Array.isArray(c.history) || !Array.isArray(c.queue) || !isStrs(c.notes) || !isStrs(c.picks)) return null;
    if (!isObj(c.mods) || ['growth', 'injury', 'minutes', 'form', 'team'].some(k => !finite((c.mods as any)[k])) || typeof c.mods.cap !== 'boolean' || typeof c.mods.oly !== 'boolean') return null;
    if (!c.queue.every(validEvent) || !c.history.every(validLog)) return null;
    if (c.phase === 'decide' && !c.queue.length) return null;
    // Sin temporadas jugadas no hay resultado que mostrar
    if (c.phase === 'result' && !c.history.length) return null;
    return c;
  } catch { return null; }
}

// ---------- Para tests y para balancear: jugar una carrera sola ----------

export type Picker = (c: Career, ev: EventInst, r: Rng) => string;
/** Elige al azar entre las opciones. */
export const randomPicker: Picker = (_c, ev, r) => r.pick(ev.options).id;

/** Juega una carrera entera con un criterio de decisión (por defecto, al azar). Con `retireAt`, se retira a esa edad. */
export function simulateRun(seed: number, o: { pos?: Pos; style?: NewCareerOpts['style']; pick?: Picker; retireAt?: number; card?: Stats | null; year?: number } = {}): Career {
  const pr = new Rng(seedState(seed ^ 0x5bd1e995));
  const pos = o.pos ?? POS[seed % POS.length];
  const style = o.style ?? STYLES[Math.floor(seed / POS.length) % STYLES.length].id;
  let c = newCareer({ seed, name: 'Test', pos, style, card: o.card, year: o.year });
  const pick = o.pick ?? randomPicker;
  for (let guard = 0; guard < 400 && c.phase !== 'over'; guard++) {
    if (c.phase === 'result') c = advance(c);
    else if (c.phase === 'decide') {
      if (o.retireAt !== undefined && c.age >= o.retireAt && canRetire(c)) { c = retireNow(c); continue; }
      c = choose(c, pick(c, c.queue[0], pr));
    }
  }
  return c;
}

