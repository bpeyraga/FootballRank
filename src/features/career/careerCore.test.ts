import { describe, expect, it, vi } from 'vitest';
import { ATTRS, POS, type Stats } from '../../shared/model';
import { AWARD, AWARD_PTS, LEGACY_STEPS, POS_W, TROPHY_PTS, contMvp, lgAward } from './careerData';
import { NATIONS, NAT_CUPS, NAT_CUP_LIST, natStar, nationOf } from './careerNations';
import { DPOS_LABEL } from './careerSetup';
import { BEST_KEY, RUN_KEY, bestKey, loadBest, loadRun, recordIfBest, runKey, saveBest, saveRun } from './careerStore';
import { loadSummary, summaryKey } from './careerSummary';
import { DEFAULT_YEAR, remainingGrowth, seasonYear } from './careerBase';
import { eliminatedAt, natTournament, runTournament } from './careerComps';
import { drawDecision, olyChance, selecChance } from './careerEvents';
import { headlineOf, milesOf, nearOf, endNear, nice } from './careerStory';
import { optionChips, riskOf } from './careerFx';
import type { Difficulty, Opt } from './careerTypes';
import {
  CLUBS, CLUB_BY_NAME, CONTS, CONT_IDS, INTL, LEAGUES, LEAGUE_IDS, asClub, clubNamed, clubsOf, gamesCap, isClubWorldCupYear, isCopaYear, isFinalissimaYear,
  finishRank, isOlympicYear, isU20Year, isWorldCupYear, qualByStrength, qualFor, sizeOf, tierOf, youthClub,
} from './careerWorld';
import { KITS, TEAMS_ASCENSO, TEAMS_PRIMERA } from '../../shared/teams';
import { Rng, seedState } from './careerRng';
import {
  MAX_AGE, MAX_STAT, MIN_STAT, RETIRE_FROM, advance, ageCurve, canRetire, cardStart, careerOvr, choose, currentEvent, legacy, legacyOf,
  legacyScore, newCareer, parseBest, parseCareer, potentialStars, randomPicker, retireFloor, retireNow, shareText, simulateRun, tally, totals, youthTarget, bestOf,
  type Career, type Club, type Picker, type SeasonLog,
} from './careerCore';

const EMPTY_SUMMARY = { run: null, best: {}, ach: 0, day: null, streak: { last: '', n: 0 } };
const flat = (n: number): Stats => ({ rit: n, tir: n, pas: n, reg: n, def: n, fis: n });
const first: Picker = (_c, ev) => ev.options[0].id;
const seeds = (n: number, k = 7919) => Array.from({ length: n }, (_, i) => (i + 1) * k);

/** Decide bien: se la juega donde conviene (entrenar de joven, fichar, la Selección, la final) y se cuida el resto. */
const smart: Picker = (c, ev) => {
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'risky' : 'safe';
    case 'selec': case 'oly': case 'debut': case 'transfer': case 'abroad': case 'renewal': case 'youth': case 'captain': case 'final': return 'risky';
    case 'home': return c.age >= 34 ? 'risky' : 'safe';
    default: return 'safe';
  }
};
/** Decide mal: se la juega donde no conviene (joda, prensa, clásico lesionado) y rechaza lo que hace crecer. */
const bad: Picker = (c, ev) => {
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'safe' : 'risky';
    case 'night': case 'hype': case 'derby': case 'coach': case 'comeback': case 'sunset': case 'rival': return 'risky';
    default: return 'safe';
  }
};

/** Un storage de mentira, para probar el guardado sin navegador. */
const fakeStorage = (opts: { broken?: boolean } = {}) => {
  const m = new Map<string, string>();
  const boom = () => { throw new Error('storage bloqueado'); };
  return {
    getItem: (k: string) => (opts.broken ? boom() : m.get(k) ?? null),
    setItem: (k: string, v: string) => (opts.broken ? boom() : void m.set(k, v)),
    removeItem: (k: string) => (opts.broken ? boom() : void m.delete(k)),
    map: m,
  };
};

/** Revisa que no haya NaN/Infinity en ningún lado del estado. */
function allFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x);
  if (Array.isArray(x)) return x.every(allFinite);
  if (x && typeof x === 'object') return Object.values(x).every(allFinite);
  return true;
}

/** Corre carreras hasta encontrar el momento que busca `ready` (y devuelve el estado justo en ese momento). */
function find(ready: (c: Career) => boolean, tries = 600, pick: Picker = randomPicker): Career {
  for (const seed of seeds(tries, 31)) {
    const pr = new Rng(seedState(seed));
    let c = newCareer({ seed, name: 'T', pos: POS[seed % 4], style: 'potrero' });
    for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
      if (ready(c)) return c;
      c = c.phase === 'result' ? advance(c) : choose(c, pick(c, c.queue[0], pr));
    }
  }
  throw new Error('no apareció la situación buscada');
}

/** Resuelve lo que quede de la temporada eligiendo siempre la primera opción, salvo la que se indique. */
function finish(c: Career, id?: string, to?: string): Career {
  let n = c;
  while (n.phase === 'decide') n = choose(n, id && n.queue[0].id === id ? to! : n.queue[0].options[0].id);
  return n;
}

describe('generador con semilla', () => {
  it('mismo estado, misma secuencia; semillas parecidas, secuencias distintas', () => {
    const a = new Rng(seedState(5)), b = new Rng(seedState(5)), c = new Rng(seedState(6));
    const sa = Array.from({ length: 20 }, () => a.next()), sb = Array.from({ length: 20 }, () => b.next()), sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every(x => x >= 0 && x < 1)).toBe(true);
  });
  it('se puede retomar desde el estado guardado', () => {
    const a = new Rng(seedState(9)); a.next(); a.next();
    const b = new Rng(a.s);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('int, poisson y weighted respetan sus rangos', () => {
    const r = new Rng(seedState(1));
    for (let i = 0; i < 500; i++) { const n = r.int(3, 6); expect(n >= 3 && n <= 6).toBe(true); }
    expect(r.poisson(0)).toBe(0);
    const mean = Array.from({ length: 4000 }, () => r.poisson(2)).reduce((t, x) => t + x, 0) / 4000;
    expect(mean).toBeGreaterThan(1.85); expect(mean).toBeLessThan(2.15);
    expect(r.weighted([['a', 0], ['b', 3]])).toBe('b');
    expect(r.weighted([['a', 0]])).toBeUndefined();
  });
});

describe('OVR por puesto', () => {
  it('los pesos suman 1 y unas stats parejas dan ese mismo OVR en cualquier puesto', () => {
    for (const p of POS) {
      expect(ATTRS.reduce((t, [k]) => t + POS_W[p][k], 0)).toBeCloseTo(1, 10);
      expect(careerOvr(flat(70), p)).toBe(70);
    }
  });
  it('cada puesto valora lo suyo: el tiro vale más en un delantero que en un arquero', () => {
    const shooter = { ...flat(50), tir: 90 }, wall = { ...flat(50), def: 90 };
    expect(careerOvr(shooter, 'DEL')).toBeGreaterThan(careerOvr(shooter, 'ARQ'));
    expect(careerOvr(wall, 'DEF')).toBeGreaterThan(careerOvr(wall, 'DEL'));
  });
});

describe('curva de edad', () => {
  it('crece hasta los 27, hace meseta hasta los 30 y cae desde los 31, cada vez más', () => {
    for (let a = 17; a <= 27; a++) expect(ageCurve(a)).toBeGreaterThan(0);
    for (let a = 17; a < 27; a++) expect(ageCurve(a + 1)).toBeLessThan(ageCurve(a));
    for (let a = 28; a <= 30; a++) expect(Math.abs(ageCurve(a))).toBeLessThanOrEqual(0.3);
    for (let a = 31; a <= 39; a++) expect(ageCurve(a)).toBeLessThan(-0.5);
    for (let a = 30; a < 39; a++) expect(ageCurve(a + 1)).toBeLessThan(ageCurve(a));
    expect(ageCurve(15)).toBe(ageCurve(17));
    expect(ageCurve(45)).toBeLessThan(ageCurve(39));
  });
  it('lo que queda por crecer baja con la edad y es 0 pasados los 27', () => {
    expect(remainingGrowth(17)).toBeGreaterThan(remainingGrowth(22));
    expect(remainingGrowth(28)).toBe(0);
  });
  it('en una carrera real el OVR sube de joven y baja de veterano (en promedio)', () => {
    let young = 0, old = 0, ny = 0, no = 0;
    for (const seed of seeds(120)) {
      for (const h of simulateRun(seed).history) {
        if (h.age <= 24) { young += h.ovr - h.ovr0; ny++; }
        if (h.age >= 33) { old += h.ovr - h.ovr0; no++; }
      }
    }
    expect(young / ny).toBeGreaterThan(1.5);
    expect(old / no).toBeLessThan(-1.5);
  });
});

describe('arranque', () => {
  it('arranca a los 17, en las inferiores de un club argentino real, con una decisión lista', () => {
    const c = newCareer({ seed: 1, name: '  Lucho  ', pos: 'DEL', style: 'potrero' });
    expect(c.age).toBe(17);
    expect(c.name).toBe('Lucho');
    expect(c.club.tier).toBe(0);
    expect(c.club.name).toBe(c.home);
    expect(c.club.lg).toBe('inf');
    expect(['ar1', 'ar2']).toContain(CLUB_BY_NAME.get(c.home)!.lg);
    expect(c.y0).toBe(DEFAULT_YEAR);
    expect(c.qual).toBeNull();
    expect(c.notes.join(' ')).toContain(c.home);
    expect(c.phase).toBe('decide');
    expect(c.queue.length).toBeGreaterThanOrEqual(1);
    expect(c.history).toEqual([]);
    const ovr = careerOvr(c.stats, c.pos);
    expect(ovr).toBeGreaterThanOrEqual(44); expect(ovr).toBeLessThanOrEqual(61);
    expect(c.potential).toBeGreaterThanOrEqual(ovr + 6);
  });
  it('sin nombre queda "Crack" y un puesto o estilo raro cae en un valor válido', () => {
    const c = newCareer({ seed: 1, name: '   ', pos: 'XXX' as any, style: 'zzz' as any });
    expect(c.name).toBe('Crack');
    expect(POS).toContain(c.pos);
    expect(['potrero', 'tactico', 'fisico']).toContain(c.style);
  });
  it('el estilo marca la forma de las stats al arrancar', () => {
    const avg = (style: 'potrero' | 'tactico' | 'fisico', k: Exclude<keyof Stats, 'arq'>) => {
      let t = 0;
      for (const seed of seeds(60)) t += newCareer({ seed, name: 'x', pos: 'MED', style }).stats[k];
      return t / 60;
    };
    expect(avg('potrero', 'reg')).toBeGreaterThan(avg('fisico', 'reg'));
    expect(avg('tactico', 'pas')).toBeGreaterThan(avg('fisico', 'pas'));
    expect(avg('fisico', 'fis')).toBeGreaterThan(avg('potrero', 'fis'));
  });
  it('"Arrancar con tu carta": versión pibe de las stats reales (45-60 de OVR) y más potencial con más OVR real', () => {
    for (const real of [30, 55, 70, 85, 99]) {
      for (const pos of POS) {
        const { stats } = cardStart(flat(real), pos, new Rng(seedState(real)));
        const o = careerOvr(stats, pos);
        expect(o).toBeGreaterThanOrEqual(45); expect(o).toBeLessThanOrEqual(60);
        expect(ATTRS.every(([k]) => stats[k] >= MIN_STAT && stats[k] <= MAX_STAT)).toBe(true);
      }
    }
    const pot = (real: number) => seeds(80).reduce((t, s) => t + cardStart(flat(real), 'MED', new Rng(seedState(s))).potential, 0) / 80;
    expect(pot(85)).toBeGreaterThan(pot(60) + 5);
    expect(pot(60)).toBeGreaterThan(pot(35) + 5);
    const c = newCareer({ seed: 3, name: 'x', pos: 'DEL', style: 'tactico', card: { rit: 90, tir: 80, pas: 70, reg: 85, def: 40, fis: 60 } });
    expect(c.fromCard).toBe(true);
    expect(c.stats.def).toBeLessThan(c.stats.tir); // conserva la forma de la carta
  });
  it('una carta con valores raros (NaN, fuera de rango) no rompe nada', () => {
    const { stats, potential } = cardStart({ rit: NaN, tir: -5, pas: 500, reg: 50, def: 50, fis: 50 }, 'DEL', new Rng(1));
    expect(allFinite(stats) && Number.isFinite(potential)).toBe(true);
    expect(ATTRS.every(([k]) => stats[k] >= MIN_STAT && stats[k] <= MAX_STAT)).toBe(true);
  });
});

describe('determinismo', () => {
  it('mismo seed + mismas decisiones = misma carrera', () => {
    for (const seed of seeds(15)) {
      const a = simulateRun(seed), b = simulateRun(seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
  it('otro seed, otra carrera', () => {
    expect(JSON.stringify(simulateRun(1).history)).not.toBe(JSON.stringify(simulateRun(2).history));
  });
  it('otras decisiones con el mismo seed también cambian la historia', () => {
    const a = simulateRun(77, { pick: first });
    const b = simulateRun(77, { pick: (_c, ev) => ev.options[ev.options.length - 1].id });
    expect(JSON.stringify(a.history)).not.toBe(JSON.stringify(b.history));
  });
  it('la carrera guardada y retomada sigue exactamente igual', () => {
    const pr = new Rng(seedState(99));
    let live = newCareer({ seed: 4321, name: 'Ana', pos: 'MED', style: 'tactico' });
    for (let i = 0; i < 25; i++) live = live.phase === 'result' ? advance(live) : choose(live, randomPicker(live, live.queue[0], pr));
    let restored = parseCareer(JSON.stringify(live))!;
    expect(restored).toEqual(live);
    const pa = new Rng(seedState(5)), pb = new Rng(seedState(5));
    for (let i = 0; i < 40 && live.phase !== 'over'; i++) {
      live = live.phase === 'result' ? advance(live) : choose(live, randomPicker(live, live.queue[0], pa));
      restored = restored.phase === 'result' ? advance(restored) : choose(restored, randomPicker(restored, restored.queue[0], pb));
    }
    expect(restored).toEqual(live);
  });
  it('choose no modifica el estado anterior', () => {
    const c = newCareer({ seed: 8, name: 'x', pos: 'DEF', style: 'fisico' });
    const before = JSON.stringify(c);
    choose(c, c.queue[0].options[0].id);
    expect(JSON.stringify(c)).toBe(before);
  });
});

describe('decisiones', () => {
  it('una opción que no existe, o fuera de turno, no cambia nada', () => {
    const c = newCareer({ seed: 8, name: 'x', pos: 'DEF', style: 'fisico' });
    expect(choose(c, 'no-existe')).toBe(c);
    const done = simulateRun(8);
    expect(choose(done, 'x')).toBe(done);
    expect(advance(c)).toBe(c);
    expect(currentEvent(done)).toBeNull();
    expect(currentEvent(c)).toBe(c.queue[0]);
  });
  it('cada temporada hay UNA decisión con exactamente dos opciones: la segura y la arriesgada (con apuesta real)', () => {
    let total = 0;
    const ids = new Set<string>();
    for (const seed of seeds(40)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide') {
          total++;
          expect(c.queue.length).toBe(1);
          const ev = c.queue[0];
          ids.add(ev.id);
          expect(ev.options.length).toBe(2);
          const [s, r] = ev.options;
          expect(s.kind).toBe('safe'); expect(r.kind).toBe('risky');
          expect(s.id).toBe('safe'); expect(r.id).toBe('risky');
          for (const o of ev.options) expect(o.label && o.up && o.icon).toBeTruthy();
          // textos cortos: la situación una línea, las opciones hasta 8 palabras
          expect(ev.text.split(/\s+/).length).toBeLessThanOrEqual(12);
          for (const o of ev.options) expect(o.label.split(/\s+/).length).toBeLessThanOrEqual(10);
          // la segura no se juega nada; la arriesgada sí, con una chance real de salir mal
          expect(r.fx.gamble).toBeTruthy();
          expect(r.fx.gamble!.p).toBeGreaterThanOrEqual(0.15); expect(r.fx.gamble!.p).toBeLessThanOrEqual(0.92); expect(r.down).toBeTruthy();
          expect(s.fx.gamble).toBeUndefined();
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(total).toBeGreaterThan(400);
    for (const id of ['plan', 'transfer', 'debut', 'derby']) expect(ids.has(id), id).toBe(true);
    expect(ids.size).toBeGreaterThanOrEqual(10);
  });
  it('las etiquetas dicen "Seguro" o el nivel de riesgo con la probabilidad real de la apuesta', () => {
    for (const seed of seeds(25)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide') {
          const [s, r] = c.queue[0].options;
          expect(optionChips(c, s)[0].text).toBe('🛡️ Seguro');
          const chips = optionChips(c, r);
          expect(chips[0].text).toMatch(/^🔥 Riesgo (bajo|medio|alto)$/);
          const k = riskOf(r);
          expect(chips.some(x => x.text.includes(`${Math.round(k.pBad * 100)} %`))).toBe(true);
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    const o = (p?: number): Opt => ({ id: 'x', kind: 'risky', icon: '', label: '', up: '', fx: p === undefined ? {} : { gamble: { p, okText: '', badText: '' } } });
    expect(riskOf(o()).level).toBe('ninguno');
    expect(riskOf(o(0.5)).level).toBe('alto');
    expect(riskOf(o(0.65)).level).toBe('medio');
    expect(riskOf(o(0.8)).level).toBe('bajo');
  });
  it('los obligatorios salen SIEMPRE: el debut a los 19 en inferiores y la vuelta tras una lesión grave', () => {
    let debuts = 0, comebacks = 0;
    for (const seed of seeds(500, 31)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'T', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && !c.tension && c.age >= 19 && c.club.tier === 0) {
          debuts++;
          expect(['debut', 'comeback']).toContain(c.queue[0].id);
        }
        if (c.phase === 'result') {
          const grave = c.history[c.history.length - 1].injury === 'grave' && !c.retire;
          if (grave) {
            comebacks++;
            expect(['comeback', 'debut']).toContain(advance(c).queue[0].id);
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(debuts).toBeGreaterThan(100);
    expect(comebacks).toBeGreaterThan(10);
  });
  it('si coinciden dos obligatorios (debut + vuelta de una lesión grave) sale uno solo', () => {
    for (const seed of seeds(100)) {
      const base = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      const d = drawDecision({ ...base, age: 19, lastInjury: 'grave' }, new Rng(seedState(seed)));
      expect(['comeback', 'debut']).toContain(d.ev.id);
    }
  });
  it('el cambio de puesto nombra el puesto en palabras, no con la sigla', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'switch', 1500);
    const r = c.queue[0].options[1];
    expect(r.label).toMatch(/^Probarte de [a-záéíóú ]+$/);
    expect(r.label).toContain(DPOS_LABEL[r.fx.dpos!].toLowerCase());
  });
  it('no se repite la misma decisión dos temporadas seguidas', () => {
    let rep = 0, tot = 0;
    for (const seed of seeds(30)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      let last = '';
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && !c.tension) { tot++; if (c.queue[0].id === last) rep++; last = c.queue[0].id; }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(rep / tot).toBeLessThan(0.12);
  });
  it('la apuesta sale como dice su probabilidad y la dificultad la empeora', () => {
    let ok = 0, n = 0, p = 0;
    for (const seed of seeds(300)) {
      let c = newCareer({ seed, name: 'x', pos: 'MED', style: 'potrero' });
      for (let g = 0; g < 30 && c.phase !== 'over' && !(c.phase === 'decide' && c.queue[0].id === 'plan'); g++) c = c.phase === 'result' ? advance(c) : choose(c, 'safe');
      if (c.phase !== 'decide' || c.queue[0].id !== 'plan') continue;
      p += c.queue[0].options[1].fx.gamble!.p;
      const d = choose(c, 'risky');
      n++; if (d.history[d.history.length - 1].risk === 'ok') ok++;
    }
    expect(n).toBeGreaterThan(150);
    expect(Math.abs(ok / n - p / n)).toBeLessThan(0.08);
    const pOf = (diff: Difficulty) => {
      let x = newCareer({ seed: 3, name: 'x', pos: 'MED', style: 'potrero', diff });
      for (let g = 0; g < 30 && !(x.phase === 'decide' && x.queue[0].id === 'plan'); g++) x = x.phase === 'result' ? advance(x) : choose(x, 'safe');
      return x.queue[0].options[1].fx.gamble!.p;
    };
    expect(pOf('normal')).toBeGreaterThan(pOf('intenso')); expect(pOf('intenso')).toBeGreaterThan(pOf('experto'));
  });
  it('riesgo vs seguro: con el mismo punto de partida, la arriesgada puede dar bastante más o bastante menos, y en promedio no es peor', () => {
    const diffs: number[] = [];
    for (const seed of seeds(120, 53)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 60 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && !c.tension && c.age >= 19) {
          for (let k = 0; k < 3; k++) {
            const base = { ...c, rng: (c.rng + k * 7919) >>> 0 };
            const a = choose(base, 'safe'), b = choose(base, 'risky');
            const ha = a.history[a.history.length - 1], hb = b.history[b.history.length - 1];
            if (ha && hb && !a.tension && !b.tension) diffs.push(hb.ovr - hb.ovr0 + hb.rating / 4 - (ha.ovr - ha.ovr0 + ha.rating / 4));
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    const m = diffs.reduce((t, x) => t + x, 0) / diffs.length;
    expect(diffs.length).toBeGreaterThan(300);
    expect(diffs.filter(x => x >= 0.6).length / diffs.length).toBeGreaterThan(0.1); // de verdad puede salir mejor
    expect(diffs.filter(x => x <= -0.6).length / diffs.length).toBeGreaterThan(0.1); // y de verdad puede salir peor
    expect(m).toBeGreaterThan(-0.4); expect(m).toBeLessThan(0.8);
  });
});

describe('categorías y traspasos', () => {
  it('la categoría de un club sube con su fuerza, y los grandes de cada región quedan donde corresponde', () => {
    let prev = 0;
    for (let p = 40; p <= 99; p += 0.5) { const t = tierOf(p); expect(t).toBeGreaterThanOrEqual(prev); prev = t; }
    expect(tierOf(50)).toBe(1);
    expect(tierOf(99)).toBe(5);
    const tier = (n: string) => clubNamed(n)!.tier;
    for (const n of ['Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo']) expect(tier(n)).toBe(3); // los grandes locales
    for (const n of ['Real Madrid', 'Barcelona', 'Manchester City', 'Bayern Múnich', 'PSG', 'Liverpool', 'Inter', 'Juventus']) expect(tier(n)).toBe(5);
    for (const n of ['Sevilla', 'Benfica', 'Ajax', 'Galatasaray', 'Aston Villa']) expect(tier(n)).toBe(4);
    for (const n of ['Colón', 'Quilmes']) expect(tier(n)).toBe(1);
    // Brasil queda entre los grandes locales y Europa media; Arabia, MLS y México por debajo de Europa media
    const avg = (id: Parameters<typeof clubsOf>[0]) => clubsOf(id).reduce((t, c) => t + c.pw, 0) / clubsOf(id).length;
    expect(avg('br')).toBeGreaterThan(avg('ar1')); expect(avg('br')).toBeLessThan(avg('es'));
    for (const id of ['mx', 'us', 'sa'] as const) expect(Math.max(...clubsOf(id).map(c => c.pw))).toBeLessThan(77);
  });
  it('aceptar una oferta (si la apuesta sale bien) te manda al club y la categoría de la oferta; si se cae, seguís donde estás o jugás mal', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'transfer');
    const offer = c.queue[0].options[1];
    const club = offer.fx.gamble!.ok!.move!.club;
    expect(offer.club).toBe(club.name);
    let ok: Career | null = null, bad: Career | null = null;
    for (let i = 0; i < 60 && (!ok || !bad); i++) {
      const n = choose({ ...c, rng: seedState(i * 7919 + 1) }, 'risky');
      const h = n.history[n.history.length - 1];
      if (h.risk === 'ok') ok = n; else bad = n;
    }
    expect(ok).not.toBeNull();
    const h = ok!.history[ok!.history.length - 1];
    expect(h.club).toBe(club.name); expect(h.tier).toBe(club.tier);
    expect(h.say).toContain(club.name);
    if (bad) expect(bad.history[bad.history.length - 1].say.length).toBeGreaterThan(5);
  });
  it('quedarte en el club no te mueve', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'transfer');
    const stay = c.queue[0].options[0];
    expect(stay.fx.move).toBeUndefined(); expect(stay.fx.gamble).toBeUndefined();
    const played = choose(c, 'safe');
    expect(played.history[played.history.length - 1].club).toBe(c.club.name);
  });
  it('las ofertas son de clubes reales, distintos del tuyo, con la categoría que les toca', () => {
    let n = 0;
    for (const seed of seeds(60, 17)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && !c.tension && c.queue[0].options[1].club) {
          const k = c.queue[0].options[1].fx.gamble?.ok?.move?.club ?? c.queue[0].options[1].fx.move?.club;
          if (k) { n++; expect(CLUB_BY_NAME.has(k.name)).toBe(true); expect(k.tier).toBe(tierOf(k.pw)); expect(LEAGUES[k.lg].name).toBeTruthy(); if (c.queue[0].id === 'transfer') expect(k.name).not.toBe(c.club.name); }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(n).toBeGreaterThan(80);
  });
  it('el préstamo te lleva a otro club y después volvés al de origen', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'loan');
    const parent = c.club;
    const n = choose(c, 'safe');
    expect(n.phase === 'result' || n.tension).toBeTruthy();
    expect(n.history[n.history.length - 1].club).not.toBe(parent.name);
    expect(n.loan?.name).toBe(parent.name);
    const next = advance(finish(n));
    expect(next.club.name).toBe(parent.name);
    expect(next.loan).toBeNull();
  });
  it('terminar entre los dos primeros de la Primera Nacional asciende al club a la Liga Profesional', () => {
    const c = find(x => x.phase === 'result' && !x.loan && x.history[x.history.length - 1].lg === 'ar2' && x.history[x.history.length - 1].fin <= 2);
    expect(c.club.lg).toBe('ar1');
    expect(c.notes.join(' ')).toContain('ascendió');
    expect(c.club.tier).toBe(tierOf(c.club.pw));
  });
  it('terminar entre los últimos de la Liga Profesional manda al club a la Primera Nacional', () => {
    const c = find(x => x.phase === 'result' && !x.loan && x.history[x.history.length - 1].lg === 'ar1' && x.history[x.history.length - 1].fin > sizeOf('ar1') - 2, 1500);
    expect(c.club.lg).toBe('ar2');
    expect(c.notes.join(' ')).toContain('descendió');
    expect(c.qual).toBeNull();
  });
  it('volver al club de las inferiores te lleva a ese club, con la fuerza que tiene hoy', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'home', 900);
    expect(c.age).toBeGreaterThanOrEqual(30);
    const n = choose(c, 'risky');
    const last = n.history[n.history.length - 1];
    expect(last.club).toBe(c.home);
    expect(last.tier).toBe(clubNamed(c.home)!.tier);
    expect(n.returned).toBe(true);
    expect(last.miles).toContain('home');
  });
  it('la vuelta al club de la infancia suma al Legado recién cuando se juega esa temporada, y quedarte no da el bonus', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'home', 900);
    const played = finish(choose(c, 'risky'));
    expect(played.returned).toBe(true);
    expect(played.returning).toBe(false);
    expect(legacyScore(played)).toBe(legacyScore({ ...played, returned: false }) + 8);
    const stay = finish(choose(c, 'safe'));
    expect(stay.returned).toBe(false); expect(stay.returning ?? false).toBe(false);
  });
  it('la Selección convoca solo con OVR alto, y más seguido a los de clubes de élite', () => {
    const base = newCareer({ seed: 2, name: 'x', pos: 'DEL', style: 'potrero' });
    const at = (age: number, club: string) => ({ ...base, age, club: clubNamed(club)! });
    expect(selecChance(at(25, 'Boca Juniors'), 55)).toBe(0);
    expect(selecChance(at(18, 'Boca Juniors'), 90)).toBe(0);
    expect(selecChance({ ...at(25, 'Boca Juniors'), loan: clubNamed('Quilmes') }, 90)).toBe(0);
    expect(selecChance(at(25, 'Real Madrid'), 92)).toBeGreaterThan(0.9);
    expect(selecChance(at(25, 'Quilmes'), 70)).toBeLessThan(0.05);
    expect(selecChance(at(25, 'Real Madrid'), 85)).toBeGreaterThan(selecChance(at(25, 'Boca Juniors'), 85));
    expect(selecChance(at(25, 'Boca Juniors'), 85)).toBeGreaterThan(selecChance(at(25, 'Colón'), 85));
    expect(selecChance(at(28, 'Al-Hilal'), 82)).toBeLessThan(selecChance(at(28, 'Manchester United'), 82)); // menos vidriera
  });
  it('los Juegos Olímpicos son solo de sub-23 y en año olímpico; el Mundial, la Copa América y el Mundial de Clubes siguen su calendario', () => {
    const base = newCareer({ seed: 2, name: 'x', pos: 'DEL', style: 'potrero', year: 2026 });
    const at = (age: number) => ({ ...base, age, club: clubNamed('Boca Juniors')! });
    expect(seasonYear(at(17))).toBe(2026);
    // 2028 = 19 años; 2032 = 23; 2036 = 27
    expect(olyChance(at(19), 70)).toBeGreaterThan(0.3);
    expect(olyChance(at(23), 70)).toBeGreaterThan(0.3);
    expect(olyChance(at(27), 90)).toBe(0);
    expect(olyChance(at(20), 90)).toBe(0); // 2029: no hay Juegos
    expect(olyChance(at(19), 50)).toBe(0);
    const years = Array.from({ length: 40 }, (_, i) => 2026 + i);
    expect(years.filter(isWorldCupYear).slice(0, 4)).toEqual([2026, 2030, 2034, 2038]);
    expect(years.filter(isCopaYear).slice(0, 3)).toEqual([2028, 2032, 2036]);
    expect(years.filter(isOlympicYear).slice(0, 3)).toEqual([2028, 2032, 2036]);
    expect(years.filter(isClubWorldCupYear).slice(0, 3)).toEqual([2029, 2033, 2037]);
    expect(years.filter(isFinalissimaYear).slice(0, 2)).toEqual([2033, 2041]);
    // Mundial y Copa América nunca el mismo año; un año de por medio queda libre
    expect(years.filter(y => isWorldCupYear(y) && isCopaYear(y))).toEqual([]);
    const ar = nationOf('ar');
    expect(natTournament(2026, ar)!.t).toBe(INTL.worldCup); expect(natTournament(2028, ar)!.t).toBe(NAT_CUPS.conmebol); expect(natTournament(2029, ar)).toBeNull();
    // Con otro año de arranque, el calendario se corre pero se respeta
    for (const y0 of [2025, 2026, 2027, 2029]) expect(seasonYear({ y0, age: 19 })).toBe(y0 + 2);
  });
  it('quien va a la Selección suma partidos; quien pide descanso, no', () => {
    const c = find(x => x.phase === 'decide' && !x.tension && x.queue[0].id === 'selec', 1500);
    const go = choose(c, 'risky'), rest = choose(c, 'safe');
    expect(go.history[go.history.length - 1].caps).toBeGreaterThan(0);
    expect(rest.history[rest.history.length - 1].caps).toBe(0);
  });
  it('si te convocan y la decisión es otra, vas igual a la Selección (con el desgaste que eso trae)', () => {
    let n = 0;
    for (const seed of seeds(200, 41)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: 'DEL', style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && !c.tension && c.mods.cap && c.queue[0].id !== 'selec') { n++; expect(c.mods.injury).toBeGreaterThan(0); }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('retiro', () => {
  it('el retiro voluntario recién se puede desde los 32', () => {
    const young = find(x => x.phase === 'decide' && x.age === RETIRE_FROM - 1);
    expect(canRetire(young)).toBe(false);
    expect(retireNow(young)).toBe(young);
    const old = find(x => x.phase === 'decide' && x.age === RETIRE_FROM);
    expect(canRetire(old)).toBe(true);
    const done = retireNow(old);
    expect(done.phase).toBe('over'); expect(done.retire).toBe('elegido'); expect(done.queue).toEqual([]);
    expect(done.history.length).toBe(old.history.length);
    expect(canRetire(done)).toBe(false);
    expect(canRetire(newCareer({ seed: 1, name: 'x', pos: 'DEL', style: 'potrero' }))).toBe(false);
  });
  it('a los 40 te retirás sí o sí', () => {
    // con las decisiones más conservadoras, igual se termina a los 40 como mucho
    const safe: Picker = (_c, ev) => (ev.options.find(o => o.id === 'care' || o.id === 'slow' || o.id === 'rest' || o.id === 'stay') ?? ev.options[0]).id;
    let sawAge = false;
    for (const seed of seeds(300, 17)) {
      const c = simulateRun(seed, { pick: safe });
      expect(c.phase).toBe('over');
      expect(c.age).toBeLessThanOrEqual(MAX_AGE);
      expect(c.history[c.history.length - 1].age).toBeLessThanOrEqual(MAX_AGE - 1);
      if (c.retire === 'edad') { sawAge = true; expect(c.age).toBe(MAX_AGE); }
    }
    expect(sawAge).toBe(true);
  });
  it('el piso de OVR para seguir sube con la edad y no hay retiro forzado antes de los 31', () => {
    expect(retireFloor(25)).toBe(0);
    for (let a = 31; a < 45; a++) expect(retireFloor(a + 1)).toBeGreaterThan(retireFloor(a));
    for (const seed of seeds(200)) {
      const c = simulateRun(seed);
      if (c.retire === 'fisico') {
        expect(c.age).toBeGreaterThanOrEqual(31);
        const last = c.history[c.history.length - 1];
        // o el OVR quedó bajo el piso, o fue una lesión grave pasados los 34
        expect(last.ovr < retireFloor(c.age) || (last.injury === 'grave' && c.age >= 34)).toBe(true);
      }
    }
  });
  it('cuando la temporada cierra con retiro forzado, "seguir" lleva al cierre de la carrera', () => {
    const c = find(x => x.phase === 'result' && x.retire !== null);
    expect(c.retire).not.toBeNull();
    const end = advance(c);
    expect(end.phase).toBe('over');
    expect(end.history.length).toBe(c.history.length);
  });
  it('si el retiro voluntario se elige apenas se puede, casi siempre dura 15 temporadas o más (nunca menos de 12) y no pasa de 24', () => {
    let short = 0;
    const n = 80;
    for (const seed of seeds(n)) {
      const c = simulateRun(seed, { retireAt: RETIRE_FROM });
      expect(c.history.length).toBeGreaterThanOrEqual(12);
      expect(c.history.length).toBeLessThanOrEqual(24);
      if (c.history.length < 15) short++; // el cuerpo dijo basta antes de los 32
    }
    expect(short / n).toBeLessThan(0.1);
  });
});

describe('Legado', () => {
  it('los escalones están ordenados y el puntaje se corta exactamente en cada umbral', () => {
    expect(LEGACY_STEPS.map(s => s.label)).toEqual(['Promesa perdida', 'Jugador de club', 'Ídolo de barrio', 'Ídolo nacional', 'Leyenda mundial', 'Mejor de la historia']);
    expect(LEGACY_STEPS[0].min).toBe(0);
    LEGACY_STEPS.forEach((s, i) => {
      if (i) expect(s.min).toBeGreaterThan(LEGACY_STEPS[i - 1].min);
      expect(legacyOf(s.min).label).toBe(s.label);
      expect(legacyOf(s.min).index).toBe(i);
      if (s.min > 0) expect(legacyOf(s.min - 1).index).toBe(i - 1);
    });
    expect(legacyOf(-5).label).toBe('Promesa perdida');
    expect(legacyOf(99999).label).toBe('Mejor de la historia');
  });
  it('un título, un premio o un partido en la Selección suman al puntaje', () => {
    const c = simulateRun(555);
    const base = legacyScore(c);
    const plus = (f: (h: Career['history'][number]) => void) => { const d = JSON.parse(JSON.stringify(c)) as Career; f(d.history[d.history.length - 1]); return legacyScore(d); };
    expect(plus(h => h.trophies.push('Champions League'))).toBeGreaterThan(base + 30);
    expect(plus(h => h.trophies.push('Copa Argentina'))).toBeGreaterThan(base);
    expect(plus(h => { h.tier = 5; h.awards.push(AWARD.ballon); })).toBeGreaterThan(base + 40);
    expect(plus(h => { h.caps += 10; })).toBeGreaterThan(base);
    expect(plus(h => { h.goals += 30; h.tier = 5; })).toBeGreaterThan(base);
  });
  it('todos los escalones se alcanzan, y los de arriba son los raros', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 600;
    for (const seed of seeds(n)) counts[legacy(simulateRun(seed)).index]++;
    expect(counts.every(x => x > 0)).toBe(true);
    expect(counts[5] / n).toBeLessThan(0.09);
    expect(counts[0] / n).toBeGreaterThan(0.05); expect(counts[0] / n).toBeLessThan(0.35);
    expect(counts[5]).toBeLessThan(counts[2]); expect(counts[4]).toBeLessThan(counts[3] + counts[2]); expect(counts[3] + counts[4] + counts[5]).toBeLessThan(counts[1] + counts[2] + counts[0]);
  });
  it('los títulos grandes pesan mucho más que los locales: Mundial, Champions y Libertadores contra una copa nacional', () => {
    const pts = (n: string) => TROPHY_PTS[n];
    for (const big of ['Mundial', 'Champions League', 'Copa Libertadores']) for (const small of ['Copa Argentina', 'FA Cup', 'Copa del Rey', 'Copa do Brasil', 'Taça de Portugal']) expect(pts(big)).toBeGreaterThanOrEqual(pts(small) * 4);
    expect(pts('Champions League')).toBeGreaterThan(pts('Premier League') * 2);
    expect(pts('Copa Libertadores')).toBeGreaterThan(pts('Liga Profesional') * 3);
    expect(pts('Mundial')).toBeGreaterThan(pts('Copa América'));
    expect(pts('Copa Libertadores')).toBeGreaterThan(pts('Copa Sudamericana'));
    expect(pts('Champions League')).toBeGreaterThan(pts('Europa League'));
    expect(pts('Europa League')).toBeGreaterThan(pts('Conference League'));
    expect(AWARD_PTS[AWARD.ballon]).toBeGreaterThan(AWARD_PTS[AWARD.ballon2]); expect(AWARD_PTS[AWARD.ballon2]).toBeGreaterThan(AWARD_PTS[AWARD.ballon3]);
    expect(AWARD_PTS[AWARD.olimpiaOro]).toBeGreaterThan(AWARD_PTS[AWARD.olimpiaPlata]);
  });
  it('tabla de Legado en 1000 carreras: al azar, bien jugadas y mal jugadas. El escalón más alto es raro', () => {
    const table = (p: Picker | undefined) => {
      const counts = [0, 0, 0, 0, 0, 0];
      for (const seed of seeds(1000)) counts[legacy(simulateRun(seed, { pick: p })).index]++;
      return counts.map(x => x / 1000);
    };
    const random = table(undefined), good = table(smart), poor = table(bad);
    // el escalón más alto: pocos con buen juego (2-8 %) y todavía menos jugando mal
    expect(good[5]).toBeGreaterThan(0.015); expect(good[5]).toBeLessThan(0.09);
    expect(random[5]).toBeLessThan(0.09);
    expect(poor[5]).toBeLessThan(good[5]);
    for (const t of [random, good, poor]) { expect(t[0] + t[1]).toBeGreaterThan(0.25); expect(t[0]).toBeLessThan(0.3); expect(t[5]).toBeLessThan(t[1]); }
    // jugar bien mueve a la gente hacia arriba
    const up = (t: number[]) => t[3] + t[4] + t[5];
    expect(up(good)).toBeGreaterThan(up(poor));
  });
  it('decidir bien importa: entrenar fuerte de joven y cuidarse de grande rinde más que salir de joda y entrenar de más de veterano', () => {
    const train: Picker = (c, ev) => (ev.id === 'plan' && c.age <= 28 ? 'risky' : 'safe');
    const party: Picker = (c, ev) => (ev.id === 'plan' ? (c.age <= 28 ? 'safe' : 'risky') : ['night', 'hype'].includes(ev.id) ? 'risky' : 'safe');
    const peak = (p: Picker) => seeds(250).reduce((t, s) => t + totals(simulateRun(s, { pick: p })).peak, 0) / 250;
    expect(peak(train)).toBeGreaterThan(peak(party));
  });
  it('totales: suman la historia y el pico sale del mejor OVR', () => {
    const c = simulateRun(1234);
    const t = totals(c);
    expect(t.seasons).toBe(c.history.length);
    expect(t.pj).toBe(c.history.reduce((a, h) => a + h.pj, 0));
    expect(t.goals).toBe(c.history.reduce((a, h) => a + h.goals, 0));
    expect(t.trophies).toBe(c.history.reduce((a, h) => a + h.trophies.length, 0));
    expect(t.peak).toBe(Math.max(...c.history.flatMap(h => [h.ovr0, h.ovr])));
    expect(t.clubs).toBe(new Set(c.history.map(h => h.club)).size);
    expect(t.clubs).toBeGreaterThanOrEqual(1);
  });
  it('el texto para compartir lleva nombre, escalón, números y el link', () => {
    const c = simulateRun(1234);
    const txt = shareText(c, 'https://ejemplo.test/#/juegos/carrera');
    const t = totals(c);
    expect(txt).toContain('De potrero a leyenda');
    expect(txt).toContain(c.surname);
    expect(txt).toContain('#' + c.num);
    expect(txt).toContain(legacy(c).label);
    expect(txt).toContain(`OVR máximo: ${t.peak}`);
    expect(txt).toContain('https://ejemplo.test/#/juegos/carrera');
    expect(txt).not.toMatch(/undefined|NaN/);
    const gk = simulateRun(1234, { pos: 'ARQ' });
    expect(shareText(gk, 'x')).toMatch(/valla/);
  });
});

describe('carreras enteras', () => {
  it('con decisiones al azar, en muchos seeds, nunca tira error y dura entre 10 y 24 temporadas', () => {
    for (const seed of seeds(400, 104729)) {
      const c = simulateRun(seed);
      expect(c.phase).toBe('over');
      expect(c.history.length).toBeGreaterThanOrEqual(10);
      expect(c.history.length).toBeLessThanOrEqual(24);
      expect(c.history[0].age).toBe(17);
      c.history.forEach((h, i) => { expect(h.n).toBe(i + 1); expect(h.age).toBe(17 + i); });
    }
  });
  it('no queda ningún NaN ni Infinity, y las stats se mantienen entre 1 y 99 durante toda la carrera', () => {
    for (const seed of seeds(150, 1291)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: (['potrero', 'tactico', 'fisico'] as const)[seed % 3] });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        expect(allFinite(c)).toBe(true);
        for (const [k] of ATTRS) { expect(c.stats[k]).toBeGreaterThanOrEqual(MIN_STAT); expect(c.stats[k]).toBeLessThanOrEqual(MAX_STAT); }
        const o = careerOvr(c.stats, c.pos);
        expect(o).toBeGreaterThanOrEqual(1); expect(o).toBeLessThanOrEqual(99);
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
      expect(allFinite(legacyScore(c))).toBe(true);
      expect(allFinite(totals(c))).toBe(true);
    }
  });
  it('cada temporada es coherente: partidos, goles, nota y OVR dentro de lo posible', () => {
    for (const seed of seeds(120, 613)) {
      for (const h of simulateRun(seed).history) {
        expect(h.pj).toBeGreaterThanOrEqual(0); expect(h.pj).toBeLessThanOrEqual(gamesCap(h.lg));
        expect(h.goals).toBeGreaterThanOrEqual(0); expect(h.assists).toBeGreaterThanOrEqual(0);
        if (h.pj === 0) expect(h.goals + h.assists).toBe(0);
        if (h.pj > 0) { expect(h.rating).toBeGreaterThanOrEqual(5.2); expect(h.rating).toBeLessThanOrEqual(9.6); } else expect(h.rating).toBe(0);
        expect(h.ovr).toBeGreaterThanOrEqual(1); expect(h.ovr).toBeLessThanOrEqual(99);
        expect(Math.abs(h.ovr - h.ovr0)).toBeLessThanOrEqual(12);
        expect(h.caps >= 0 && h.capGoals >= 0).toBe(true);
        expect(h.tier >= 0 && h.tier <= 5).toBe(true);
      }
    }
  });
  it('los arqueros casi no hacen goles y los delanteros sí', () => {
    const goals = (pos: 'ARQ' | 'DEL') => seeds(80).reduce((t, s) => t + totals(simulateRun(s, { pos })).goals, 0) / 80;
    expect(goals('ARQ')).toBeLessThan(5);
    expect(goals('DEL')).toBeGreaterThan(60);
  });
  it('los de más potencial llegan más alto: más OVR, más categoría', () => {
    const runs = seeds(250).map(s => simulateRun(s));
    const lo = runs.filter(c => c.potential < 65), hi = runs.filter(c => c.potential > 82);
    const mean = (cs: Career[], f: (c: Career) => number) => cs.reduce((t, c) => t + f(c), 0) / cs.length;
    expect(lo.length).toBeGreaterThan(5); expect(hi.length).toBeGreaterThan(5);
    expect(mean(hi, c => totals(c).peak)).toBeGreaterThan(mean(lo, c => totals(c).peak) + 10);
    expect(mean(hi, c => totals(c).peakTier)).toBeGreaterThan(mean(lo, c => totals(c).peakTier) + 1);
  });
});

describe('el mundo real: clubes, ligas y copas', () => {
  const names = new Set(CLUBS.map(c => c.name));
  it('todos los clubes tienen nombre único, una liga que existe y una fuerza razonable', () => {
    expect(names.size).toBe(CLUBS.length);
    for (const c of CLUBS) {
      expect(LEAGUES[c.lg], c.name).toBeDefined();
      expect(c.lg).not.toBe('inf');
      expect(c.pw).toBeGreaterThanOrEqual(50); expect(c.pw).toBeLessThanOrEqual(92);
      expect(clubNamed(c.name)).toEqual(asClub(c));
    }
    for (const id of LEAGUE_IDS) if (id !== 'inf') expect(clubsOf(id).length, id).toBeGreaterThanOrEqual(5);
    expect(clubNamed('Sportivo Los Aromos')).toBeNull();
  });
  it('los clubes argentinos son exactamente los de la lista de la app, para poder mostrar su escudo', () => {
    expect(clubsOf('ar1').map(c => c.name).sort()).toEqual([...TEAMS_PRIMERA].sort());
    const ar2 = clubsOf('ar2').map(c => c.name);
    for (const n of TEAMS_ASCENSO) expect(ar2).toContain(n);
    for (const n of [...TEAMS_PRIMERA, ...TEAMS_ASCENSO]) expect(KITS[n], n).toBeDefined();
    for (const n of ['Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo']) expect(clubNamed(n)!.lg).toBe('ar1');
  });
  it('están los clubes más conocidos de cada región, con los nombres que se usan acá', () => {
    const want = [
      'Flamengo', 'Palmeiras', 'São Paulo', 'Corinthians', 'Santos', 'Fluminense', 'Grêmio', 'Internacional', 'Atlético Mineiro', 'Cruzeiro', 'Botafogo', 'Vasco da Gama', 'Bahia', 'Fortaleza',
      'Peñarol', 'Nacional de Montevideo', 'Defensor Sporting', 'Danubio', 'Liverpool de Montevideo', 'Colo-Colo', 'Universidad de Chile', 'Universidad Católica',
      'Atlético Nacional', 'Millonarios', 'América de Cali', 'Junior', 'Olimpia', 'Cerro Porteño', 'Libertad', 'LDU Quito', 'Barcelona SC', 'Independiente del Valle',
      'Club América', 'Chivas', 'Cruz Azul', 'Pumas', 'Tigres', 'Monterrey', 'Toluca', 'Santos Laguna',
      'Inter Miami', 'LA Galaxy', 'LAFC', 'NYCFC', 'Atlanta United', 'Seattle Sounders', 'Al-Hilal', 'Al-Nassr', 'Al-Ittihad', 'Al-Ahli',
    ];
    for (const n of want) expect(names.has(n), n).toBe(true);
    const elite = ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Manchester United', 'Tottenham', 'Bayern Múnich', 'Borussia Dortmund', 'Bayer Leverkusen', 'PSG', 'Inter', 'Milan', 'Juventus', 'Napoli'];
    const medium = ['Sevilla', 'Villarreal', 'Real Betis', 'Real Sociedad', 'Athletic Club', 'Valencia', 'Girona', 'Aston Villa', 'Newcastle', 'West Ham', 'Brighton', 'RB Leipzig', 'Stuttgart', 'Eintracht Fráncfort', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna',
      'Marsella', 'Lyon', 'Mónaco', 'Lille', 'Benfica', 'Porto', 'Sporting Lisboa', 'Ajax', 'PSV', 'Feyenoord', 'Galatasaray', 'Fenerbahçe', 'Beşiktaş'];
    for (const n of elite) expect(clubNamed(n)?.tier, n).toBe(5);
    for (const n of medium) expect(clubNamed(n)?.tier, n).toBe(4);
    expect(CLUBS.length).toBeGreaterThan(220);
  });
  it('hay ligas, copas nacionales y continentales con sus nombres reales, y cada título vale puntos', () => {
    const lgs = LEAGUE_IDS.map(id => LEAGUES[id].name);
    for (const n of ['Liga Profesional', 'Primera Nacional', 'Brasileirão', 'Liga MX', 'MLS', 'Saudi Pro League', 'Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Liga Portugal', 'Eredivisie', 'Süper Lig']) expect(lgs).toContain(n);
    const cups = new Set(LEAGUE_IDS.map(id => LEAGUES[id].cup));
    for (const n of ['Copa Argentina', 'Copa do Brasil', 'FA Cup', 'Copa del Rey', 'Coppa Italia', 'DFB-Pokal', 'Copa de Francia', 'Taça de Portugal', 'KNVB Beker', 'Copa de Turquía']) expect(cups.has(n), n).toBe(true);
    expect(CONT_IDS.map(id => CONTS[id].name)).toEqual(['Copa Libertadores', 'Copa Sudamericana', 'Champions League', 'Europa League', 'Conference League', 'Concachampions', 'Champions League de Asia']);
    for (const id of LEAGUE_IDS) { expect(TROPHY_PTS[LEAGUES[id].name]).toBeGreaterThan(0); const cup = LEAGUES[id].cup; if (cup) expect(TROPHY_PTS[cup]).toBeGreaterThan(0); }
    for (const id of CONT_IDS) expect(TROPHY_PTS[CONTS[id].name]).toBeGreaterThan(0);
    for (const t of [INTL.worldCup, INTL.olympics, INTL.finalissima, INTL.clubWorldCup, INTL.trofeo, INTL.recopa, INTL.u20, ...NAT_CUP_LIST]) expect(TROPHY_PTS[t.name]).toBeGreaterThan(0);
    for (const t of NAT_CUP_LIST) expect(AWARD_PTS[natStar(t.name)]).toBeGreaterThan(0);
    expect(LEAGUES.ar1.extra!.name).toBe('Copa de la Liga'); expect(TROPHY_PTS['Copa de la Liga']).toBeGreaterThan(0);
    for (const id of LEAGUE_IDS) for (const k of ['scorer', 'assist', 'keeper', 'defender', 'best', 'rookie'] as const) expect(AWARD_PTS[lgAward[k](id)], id + k).toBeGreaterThan(0);
    for (const id of CONT_IDS) expect(AWARD_PTS[contMvp(CONTS[id].name)]).toBeGreaterThan(0);
  });
  it('cada liga clasifica solo a copas de su confederación: nada de Libertadores para Europa ni de Champions para la Argentina', () => {
    for (const id of LEAGUE_IDS) {
      const L = LEAGUES[id];
      for (const [cid] of L.slots) expect(CONTS[cid].conf, id).toBe(L.conf);
      if (L.cupQual) expect(CONTS[L.cupQual].conf, id).toBe(L.conf);
      for (let rank = 1; rank <= sizeOf(id); rank++) { const q = qualFor(id, rank); if (q) expect(CONTS[q].conf, id).toBe(L.conf); }
    }
    for (const id of ['ar1', 'ar2', 'br', 'uy', 'cl', 'co', 'py', 'ec'] as const) { expect(qualFor(id, 1) === null || ['lib', 'sud'].includes(qualFor(id, 1)!)).toBe(true); }
    for (const id of ['en', 'es', 'it', 'de', 'fr', 'pt', 'nl', 'tr'] as const) expect(['cl', 'el', 'ecl']).toContain(qualFor(id, 1));
    expect(qualFor('mx', 1)).toBe('ccc'); expect(qualFor('us', 1)).toBe('ccc'); expect(qualFor('sa', 1)).toBe('acl');
  });
  it('la clasificación sale de la posición en la tabla (o de la fuerza del club, si todavía no hay tabla): arriba Libertadores, en el medio Sudamericana, abajo nada', () => {
    expect(qualFor('ar1', 1)).toBe('lib'); expect(qualFor('ar1', 4)).toBe('lib'); expect(qualFor('ar1', 5)).toBe('sud'); expect(qualFor('ar1', 12)).toBe('sud');
    expect(qualFor('ar1', 13)).toBeNull(); expect(qualFor('ar1', 30)).toBeNull();
    expect(qualFor('en', 1)).toBe('cl'); expect(qualFor('en', 5)).toBe('el'); expect(qualFor('en', 7)).toBe('ecl'); expect(qualFor('en', 15)).toBeNull();
    expect(qualFor('ar2', 1)).toBeNull(); expect(qualFor('inf', 1)).toBeNull();
    expect(qualByStrength(clubNamed('River Plate')!)).toBe('lib');
    expect(qualByStrength(clubNamed('Talleres')!)).toBe('sud');
    expect(qualByStrength(clubNamed('Aldosivi')!)).toBeNull();
    expect(qualByStrength(clubNamed('Colón')!)).toBeNull();
    expect(qualByStrength(clubNamed('Real Madrid')!)).toBe('cl');
    expect(qualByStrength(clubNamed('Sevilla')!)).toBe('ecl');
    expect(qualByStrength(youthClub(CLUBS[0]))).toBeNull();
  });
  it('la tabla y las copas dependen de la fuerza del club y de lo que aportás: el más fuerte gana más, nada es seguro', () => {
    const r = new Rng(seedState(7));
    const club = (n: string) => clubNamed(n)!;
    const titles = (c: Club, boost = 0) => { let w = 0; for (let i = 0; i < 1500; i++) if (finishRank(c, boost, r) === 1) w++; return w / 1500; };
    expect(titles(club('River Plate'))).toBeGreaterThan(titles(club('Lanús')) * 2);
    expect(titles(club('Real Madrid'))).toBeGreaterThan(titles(club('Sevilla')));
    expect(titles(club('River Plate'), 3)).toBeGreaterThan(titles(club('River Plate'), 0));
    expect(titles(club('River Plate'))).toBeLessThan(0.5);
    for (const c of CLUBS.slice(0, 40)) { const k = finishRank(asClub(c), 0, r); expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(sizeOf(c.lg)); }
    const win = (mine: number, id: keyof typeof CONTS) => { let w = 0; for (let i = 0; i < 1500; i++) if (runTournament(mine, CONTS[id], r, 2).won) w++; return w / 1500; };
    expect(win(89, 'cl')).toBeGreaterThan(win(80, 'cl'));
    expect(win(89, 'cl')).toBeLessThan(0.4); expect(win(70, 'cl')).toBeLessThan(0.03);
    expect(win(76, 'lib')).toBeGreaterThan(win(66, 'lib'));
    for (let i = 0; i < 200; i++) {
      const run = runTournament(80, CONTS.lib, r, 2);
      expect(run.matches).toBeGreaterThanOrEqual(CONTS.lib.base);
      expect(run.round).toBeGreaterThanOrEqual(0); expect(run.round).toBeLessThan(CONTS.lib.rounds.length);
      expect(run.matches).toBeLessThanOrEqual(CONTS.lib.base + 2 * (CONTS.lib.rounds.length - 2) + 1);
    }
    expect(eliminatedAt('Fase de grupos')).toBe('en la fase de grupos'); expect(eliminatedAt('Final')).toBe('en la final'); expect(eliminatedAt('Cuartos de final')).toBe('en cuartos de final');
  });
  it('el nombre de ningún jugador real aparece en el juego (el único jugador sos vos)', () => {
    const files = import.meta.glob<string>(['./career*.ts', './Career*.tsx', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(8);
    for (const [file, text] of Object.entries(files)) expect(text, file).not.toMatch(/\b(Messi|Maradona|Pel[eé](?![a-zA-Z])|Cristiano|Neymar|Mbapp[eé]|Haaland|Di Mar[ií]a|Riquelme|Kempes|Batistuta|Zidane|Cruyff|Platini|Lautaro|Julián Álvarez|Dybala)\b/);
  });
});

describe('competencias y premios en carreras enteras', () => {
  const CWC_NAMES = ['lib', 'cl', 'ccc', 'acl'].map(id => CONTS[id as keyof typeof CONTS].name);
  const TOP5 = ['en', 'es', 'it', 'de', 'fr'];

  it('en 400 carreras (al azar y bien jugadas, de distintas nacionalidades y años de arranque) cada título y premio respeta las reglas de su competencia', () => {
    const seen: Record<string, number> = {};
    const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
    const trophyNames = new Set(Object.keys(TROPHY_PTS)), awardNames = new Set(Object.keys(AWARD_PTS));
    const contNames = new Set(CONT_IDS.map(id => CONTS[id].name));
    const natCups = new Map(NAT_CUP_LIST.map(t => [t.name, t]));
    const nats = ['ar', 'ar', 'ar', 'br', 'es', 'uy', 'mx', 'jp', 'ma', 'fr', 'us', 'ca'];
    seeds(400, 3571).forEach((seed, i) => {
      const nat = nats[i % nats.length], N = nationOf(nat);
      const c = simulateRun(seed, { pick: i % 2 ? smart : undefined, year: 2026 + (i % 4), nat });
      expect(c.nat).toBe(nat);
      c.history.forEach((h, k) => {
        const year = c.y0 + h.age - 17, L = LEAGUES[h.lg], prev = c.history[k - 1];
        expect(CLUB_BY_NAME.has(h.club), h.club).toBe(true);
        expect(h.lg === 'inf').toBe(h.tier === 0);
        expect(h.fin).toBeGreaterThanOrEqual(1); expect(h.fin).toBeLessThanOrEqual(sizeOf(h.lg));
        if (h.cont) { expect(contNames.has(h.cont)).toBe(true); expect(CONTS[CONT_IDS.find(id => CONTS[id].name === h.cont)!].conf).toBe(L.conf); }
        for (const t of h.trophies) {
          bump(t);
          expect(trophyNames.has(t), t).toBe(true);
          if (contNames.has(t)) expect(h.cont, t).toBe(t); // solo se gana la copa continental que se jugó
          else if (t === INTL.worldCup.name) { expect(isWorldCupYear(year)).toBe(true); expect(h.caps).toBeGreaterThanOrEqual(3); }
          else if (natCups.has(t)) { // el torneo de selecciones de TU confederación, en su año
            const cup = natCups.get(t)!;
            expect(cup.conf, t).toBe(N.conf); expect(cup.year(year), t + ' ' + year).toBe(true); expect(h.caps).toBeGreaterThanOrEqual(3);
          }
          else if (t === INTL.olympics.name) { expect(isOlympicYear(year)).toBe(true); expect(h.age).toBeLessThanOrEqual(23); }
          else if (t === INTL.u20.name) { expect(h.age).toBeGreaterThanOrEqual(18); expect(h.age).toBeLessThanOrEqual(20); expect(isU20Year(year)).toBe(true); }
          else if (t === INTL.finalissima.name) { expect(isFinalissimaYear(year)).toBe(true); expect(N.conf).toBe('conmebol'); }
          else if (t === INTL.trofeo.name) { expect(h.lg).toBe('ar1'); expect(prev?.club).toBe(h.club); }
          else if (t === INTL.recopa.name) { expect(prev?.club).toBe(h.club); expect(prev!.trophies.some(x => x === CONTS.lib.name || x === CONTS.sud.name)).toBe(true); }
          else if (t === INTL.clubWorldCup.name) {
            expect(isClubWorldCupYear(year)).toBe(true);
            expect(prev?.club).toBe(h.club); // el campeón continental del año anterior, con el mismo club
            expect(prev!.trophies.some(x => CWC_NAMES.includes(x))).toBe(true);
          } else if (t === L.name) expect(h.fin).toBe(1);
          else if (L.extra && t === L.extra.name) expect(h.lg).toBe('ar1');
          else expect(t, 'copa nacional de otra liga').toBe(L.cup);
        }
        for (const a of h.awards) {
          bump(a);
          expect(awardNames.has(a), a).toBe(true);
          if (a === AWARD.ballon || a === AWARD.ballon2 || a === AWARD.ballon3) { expect(L.conf).toBe('uefa'); expect(h.tier).toBeGreaterThanOrEqual(4); }
          else if (a === AWARD.boot) expect(TOP5).toContain(h.lg);
          else if (a === AWARD.golden) { expect(h.age).toBeLessThanOrEqual(21); expect(L.conf).toBe('uefa'); }
          else if (a === AWARD.puskas) expect(h.lg).not.toBe('inf'); // en las inferiores no hay Puskás
          else if (a === AWARD.olimpiaPlata || a === AWARD.olimpiaOro) { if (a === AWARD.olimpiaPlata) expect(h.lg).toBe('ar1'); }
          else if (a === AWARD.wcStar) expect(h.trophies).toContain(INTL.worldCup.name);
          else if (NAT_CUP_LIST.some(t => a === natStar(t.name))) expect(h.trophies.some(t => natCups.has(t))).toBe(true);
          else if (CONT_IDS.some(id => a === contMvp(CONTS[id].name))) expect(a).toBe(contMvp(h.cont));
          else if (a.includes(': ')) expect(a.startsWith(L.name + ': ')).toBe(true);
        }
        // Los textos de la temporada
        const said = h.lines.join(' ');
        if (said.includes('Juegos Olímpicos')) { expect(isOlympicYear(year)).toBe(true); expect(h.age).toBeLessThanOrEqual(23); }
        if (/del Mundial\b(?! de Clubes| Sub-20)/.test(said)) expect(isWorldCupYear(year)).toBe(true);
        expect(said).not.toMatch(/undefined|NaN|\[object|\b1 (partidos|goles|asistencias)\b/);
        if (h.age > 23) expect(h.trophies).not.toContain(INTL.olympics.name);
      });
    });
    // y de todo eso pasa, no es solo teoría
    for (const t of ['Liga Profesional', 'Primera Nacional', 'Copa Argentina', 'Copa de la Liga', 'Copa Libertadores', 'Copa Sudamericana', 'Champions League', 'Europa League', 'Premier League', 'LaLiga', 'Bundesliga',
      'Copa América', 'Eurocopa', 'Mundial', 'Juegos Olímpicos', AWARD.ballon, AWARD.olimpiaPlata]) expect(seen[t] ?? 0, t).toBeGreaterThan(0);
  });

  it('en cada paso de 120 carreras el estado es válido: clubes reales, copa continental de su confederación y ofertas solo de clubes que existen', () => {
    seeds(120, 2791).forEach((seed, i) => {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'T', pos: POS[seed % 4], style: 'tactico', year: 2026 + (i % 3) });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        expect(parseCareer(JSON.stringify(c)), 'seed ' + seed + ' paso ' + g).not.toBeNull();
        expect(allFinite(c)).toBe(true);
        if (c.phase === 'decide') {
          for (const ev of c.queue) for (const o of ev.options) {
            const m = o.fx.move;
            if (!m) continue;
            expect(CLUB_BY_NAME.has(m.club.name), m.club.name).toBe(true);
            expect(m.club).toEqual(clubNamed(m.club.name));
            if (c.club.lg !== 'inf') expect(m.club.name).not.toBe(c.club.name);
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    });
  });

  it('arranca en las inferiores de clubes de Primera y de Ascenso, mucho más que de los cinco grandes', () => {
    const homes = seeds(600).map(sd => newCareer({ seed: sd, name: 'x', pos: 'MED', style: 'tactico' }).home);
    const grandes = homes.filter(h => ['Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo'].includes(h)).length;
    expect(new Set(homes).size).toBeGreaterThan(40);
    expect(grandes).toBeGreaterThan(0); expect(grandes / 600).toBeLessThan(0.2);
    expect(homes.filter(h => CLUB_BY_NAME.get(h)!.lg === 'ar2').length / 600).toBeGreaterThan(0.25);
  });

  it('las ofertas de Arabia, la MLS y México van con riesgo y plata; Europa le llega a los pibes con potencial', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'cash', 1500);
    const go = c.queue[0].options[1];
    const lg = CLUB_BY_NAME.get(go.club!)!.lg;
    expect(['sa', 'us', 'mx']).toContain(lg);
    expect(go.fx.gamble!.ok!.move!.club.name).toBe(go.club);
    expect(c.age).toBeGreaterThanOrEqual(28);
    expect(LEAGUES.sa.flavor).toBe('Te llenan de plata, pero la vidriera es menor.');
    const e = find(x => x.phase === 'decide' && x.queue[0].id === 'abroad', 900);
    const club = e.queue[0].options[1].fx.gamble!.ok!.move!.club;
    expect(LEAGUES[club.lg].conf).toBe('uefa');
    expect(club.tier).toBeGreaterThanOrEqual(3);
    expect(e.age).toBeLessThanOrEqual(24);
  });

  it('en los clubes de Europa las ofertas incluyen "Volver a tu club de inferiores" ya de grande, y el club es el mismo con el que arrancaste', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'home', 900);
    const back = c.queue[0].options[1];
    expect(back.label).toBe('Volver a ' + c.home);
    expect(back.fx.move!.kind).toBe('return');
    expect(back.fx.move!.club.name).toBe(c.home);
    expect(CLUB_BY_NAME.get(c.home)!.lg === 'ar1' || CLUB_BY_NAME.get(c.home)!.lg === 'ar2').toBe(true);
  });
});

describe('guardado', () => {
  it('parseCareer devuelve la carrera tal cual si está bien', () => {
    const c = simulateRun(42);
    expect(parseCareer(JSON.stringify(c))).toEqual(c);
    const mid = find(x => x.phase === 'decide' && x.history.length > 3);
    expect(parseCareer(JSON.parse(JSON.stringify(mid)))).toEqual(mid);
  });
  it('rechaza lo roto, viejo o inventado sin tirar error', () => {
    const c = simulateRun(42);
    const bad: unknown[] = [null, undefined, 5, 'x', '{', '[]', {}, { v: 3 }, { ...c, v: 1 }, { ...c, v: 2 }, { ...c, v: 5 }, { ...c, pos: 'ZZZ' }, { ...c, style: 'x' }, { ...c, phase: 'nada' },
      { ...c, age: NaN }, { ...c, stats: { rit: 1 } }, { ...c, history: 'no' }, { ...c, club: null }, { ...c, club: { ...c.club, tier: 9 } },
      { ...c, mods: null }, { ...c, phase: 'decide', queue: [] }, { ...c, phase: 'decide', queue: [{ id: 'x', options: [] }] }];
    for (const b of bad) expect(parseCareer(b)).toBeNull();
  });
  it('una decisión pendiente sin opciones no se acepta: así no queda una carrera trabada', () => {
    const mid = find(x => x.phase === 'decide');
    const broken = JSON.parse(JSON.stringify(mid)) as Career;
    (broken.queue[0] as { options: unknown[] }).options = [];
    expect(parseCareer(broken)).toBeNull();
  });
  it('rechaza saves que romperían la pantalla: resultado sin temporadas, categoría o club raros, opciones rotas, préstamo u origen inválidos', () => {
    const mid = find(x => x.phase === 'decide' && x.history.length > 2);
    const res = find(x => x.phase === 'result');
    const done = simulateRun(42);
    const mut = (src: Career, f: (d: any) => void) => { const d = JSON.parse(JSON.stringify(src)); f(d); return d; };
    // Los originales están bien: lo que sigue falla por la modificación, no por otra cosa
    for (const ok of [mid, res, done]) expect(parseCareer(mut(ok, () => {}))).toEqual(ok);
    const bad: [string, unknown][] = [
      ['resultado sin temporadas', mut(res, d => { d.history = []; })],
      ['tier decimal', mut(mid, d => { d.club.tier = 2.5; })],
      ['tier negativo', mut(mid, d => { d.club.tier = -1; })],
      ['tier fuera de rango', mut(mid, d => { d.club.tier = 6; })],
      ['tier como texto', mut(mid, d => { d.club.tier = '2'; })],
      ['club sin nombre', mut(mid, d => { d.club.name = 5; })],
      ['opción null', mut(mid, d => { d.queue[0].options = [null]; })],
      ['opción como texto', mut(mid, d => { d.queue[0].options = ['x']; })],
      ['opción sin fx', mut(mid, d => { delete d.queue[0].options[0].fx; })],
      ['fx null', mut(mid, d => { d.queue[0].options[0].fx = null; })],
      ['fx como array', mut(mid, d => { d.queue[0].options[0].fx = []; })],
      ['label numérico', mut(mid, d => { d.queue[0].options[0].label = 5; })],
      ['opción sin id', mut(mid, d => { delete d.queue[0].options[0].id; })],
      ['mudanza con club roto', mut(mid, d => { d.queue[0].options[0].fx = { move: { club: { name: 'X' }, kind: 'transfer' } }; })],
      ['mudanza de tipo desconocido', mut(mid, d => { d.queue[0].options[0].fx = { move: { club: { name: 'Boca Juniors', tier: 3, pw: 75.5, lg: 'ar1' }, kind: 'regalo' } }; })],
      ['mudanza a un club que no existe', mut(mid, d => { d.queue[0].options[0].fx = { move: { club: { name: 'Sportivo Los Aromos', tier: 2, pw: 68, lg: 'ar1' }, kind: 'transfer' } }; })],
      ['riesgo sin probabilidad', mut(mid, d => { d.queue[0].options[0].fx = { gamble: { okText: '', badText: '' } }; })],
      ['evento sin título', mut(mid, d => { delete d.queue[0].title; })],
      ['préstamo vacío', mut(mid, d => { d.loan = {}; })],
      ['préstamo como texto', mut(mid, d => { d.loan = 'club'; })],
      ['préstamo con tier inválido', mut(mid, d => { d.loan = { name: 'X', tier: 9, str: 1 }; })],
      ['sin campo préstamo', mut(mid, d => { delete d.loan; })],
      ['origen null', mut(mid, d => { d.home = null; })],
      ['origen vacío', mut(mid, d => { d.home = ''; })],
      ['sin origen', mut(mid, d => { delete d.home; })],
      ['temporada sin lines', mut(res, d => { delete d.history[d.history.length - 1].lines; })],
      ['temporada con picks de otro tipo', mut(res, d => { d.history[d.history.length - 1].picks = 'x'; })],
      ['temporada con tier inválido', mut(done, d => { d.history[0].tier = 7; })],
      ['temporada sin club', mut(done, d => { delete d.history[0].club; })],
      ['notas que no son texto', mut(mid, d => { d.notes = [{}]; })],
      ['edad decimal', mut(mid, d => { d.age = 20.5; })],
      ['edad fuera de rango', mut(mid, d => { d.age = 90; })],
      ['retiro desconocido', mut(done, d => { d.retire = 'jubilado'; })],
      ['mods sin cap', mut(mid, d => { delete d.mods.cap; })],
    ];
    for (const [why, b] of bad) expect(parseCareer(b), why).toBeNull();
  });
  it('rechaza lo que no cuadra con el mundo: club inventado, copa de otra confederación o una categoría que no corresponde', () => {
    const mid = find(x => x.phase === 'decide' && x.history.length > 2);
    const mut = (f: (d: any) => void) => { const d = JSON.parse(JSON.stringify(mid)); f(d); return d; };
    const boca = clubNamed('Boca Juniors')!, madrid = clubNamed('Real Madrid')!;
    expect(parseCareer(mut(d => { d.club = boca; d.qual = 'lib'; }))).not.toBeNull();
    expect(parseCareer(mut(d => { d.club = madrid; d.qual = 'cl'; }))).not.toBeNull();
    const bad: [string, unknown][] = [
      ['Libertadores para un club europeo', mut(d => { d.club = madrid; d.qual = 'lib'; })],
      ['Champions para un club argentino', mut(d => { d.club = boca; d.qual = 'cl'; })],
      ['Concachampions para un club argentino', mut(d => { d.club = boca; d.qual = 'ccc'; })],
      ['copa que no existe', mut(d => { d.club = boca; d.qual = 'zzz'; })],
      ['copa continental en las inferiores', mut(d => { d.club = youthClub(CLUBS[0]); d.qual = 'lib'; })],
      ['club inventado', mut(d => { d.club = { ...boca, name: 'Sportivo Los Aromos' }; d.qual = null; })],
      ['liga que no existe', mut(d => { d.club = { ...boca, lg: 'xx' }; d.qual = null; })],
      ['categoría que no cuadra con la fuerza', mut(d => { d.club = { ...boca, tier: 5 }; d.qual = null; })],
      ['club de las inferiores inventado', mut(d => { d.home = 'Sportivo Los Aromos'; })],
      ['sin año de arranque', mut(d => { delete d.y0; })],
      ['sin la marca de Olímpicos', mut(d => { delete d.mods.oly; })],
      ['temporada con liga inventada', mut(d => { d.history[0].lg = 'xx'; })],
      ['temporada sin puesto en la tabla', mut(d => { delete d.history[0].fin; })],
    ];
    for (const [why, b] of bad) expect(parseCareer(b), why).toBeNull();
  });
  it('las carreras guardadas con clubes inventados (versión 1) se descartan: la carrera, la mejor y el resumen de Inicio arrancan de cero', () => {
    const st = fakeStorage();
    vi.stubGlobal('localStorage', st);
    try {
      const mid = find(x => x.phase === 'decide' && x.history.length > 2);
      for (const v of [1, 2]) { const o = JSON.parse(JSON.stringify(mid)); o.v = v; expect(parseCareer(o), 'versión ' + v).toBeNull(); }
      const old = JSON.parse(JSON.stringify(mid)); old.v = 1; old.home = 'Sportivo Los Aromos'; old.club = { name: 'Sportivo Los Aromos', tier: 2, str: 1 };
      st.map.set(runKey('u1'), JSON.stringify(old));
      st.map.set(bestKey('u1'), JSON.stringify({ seed: 1, name: 'Viejo', pos: 'DEL', label: 'Ídolo', score: 300, peak: 80, seasons: 15, trophies: 5 }));
      st.map.set(summaryKey('u1'), JSON.stringify({ run: { name: 'Viejo', season: 7 }, best: { label: 'Ídolo', score: 300 } }));
      st.map.set(summaryKey('u1') + 'x', 'otro');
      // la tarjeta de Inicio ya no muestra lo viejo, ni siquiera sin abrir el juego
      expect(loadSummary('u1')).toEqual(EMPTY_SUMMARY);
      expect(loadRun('u1')).toBeNull();
      expect(loadBest('u1')).toBeNull();
      expect(loadSummary('u1')).toEqual(EMPTY_SUMMARY);
      // una carrera nueva se guarda y se lee normal
      const fresh = newCareer({ seed: 11, name: 'Nuevo', pos: 'DEL', style: 'potrero' });
      saveRun(fresh, 'u1');
      expect(loadRun('u1')).toEqual(fresh);
      expect(loadSummary('u1').run?.name).toBe('Nuevo');
    } finally { vi.unstubAllGlobals(); }
  });
  it('un save roto en el dispositivo no tira la pantalla: se arranca de cero (sin carrera ni resumen en curso)', () => {
    const res = find(x => x.phase === 'result');
    const broken = JSON.parse(JSON.stringify(res)); broken.history = [];
    const st = fakeStorage();
    vi.stubGlobal('localStorage', st);
    try {
      st.map.set(runKey('u1'), JSON.stringify(broken));
      st.map.set(summaryKey('u1'), JSON.stringify({ run: { name: 'Viejo', season: 3 }, best: null }));
      expect(loadRun('u1')).toBeNull();
      expect(loadSummary('u1').run).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('textos y resúmenes', () => {
  it('tally cuenta repetidos y pone primero lo más valioso', () => {
    expect(tally(['FA Cup', 'Premier League', 'FA Cup'], TROPHY_PTS)).toEqual([['Premier League', 1], ['FA Cup', 2]]);
    expect(tally(['Champions League', 'Copa Argentina', 'Champions League', 'Champions League'], TROPHY_PTS)).toEqual([['Champions League', 3], ['Copa Argentina', 1]]);
    expect(tally(['a', 'b', 'b'])).toEqual([['b', 2], ['a', 1]]);
    expect(tally([])).toEqual([]);
  });
  it('el titular es una línea corta de diario y cuenta lo más importante que pasó', () => {
    const base = simulateRun(2024, { nat: 'ar' });
    const h = (o: Partial<SeasonLog>): Career => { const d = JSON.parse(JSON.stringify(base)) as Career; Object.assign(d.history[d.history.length - 1], { injury: null, promo: null, ev: '', risk: null, trophies: [], awards: [] }, o); return d; };
    expect(headlineOf(h({ awards: [AWARD.ballon] }))).toContain('Balón de Oro');
    expect(headlineOf(h({ trophies: ['Mundial'], awards: [] }))).toMatch(/mundo/i);
    expect(headlineOf(h({ trophies: ['Champions League'], awards: [] }))).toMatch(/Champions|Europa/);
    expect(headlineOf(h({ trophies: ['Copa Libertadores'], awards: [] }))).toMatch(/Libertadores|América/);
    expect(headlineOf(h({ trophies: ['Copa América'], awards: [] }))).toMatch(/Selección/);
    expect(headlineOf(h({ trophies: ['Liga Profesional', 'Copa Argentina'], awards: [] }))).toMatch(/ensueño/);
    // un título de la Selección no se cuenta como del club
    expect(headlineOf(h({ trophies: ['Mundial Sub-20'], awards: [] }))).toBe('¡Campeón del Mundial Sub-20 con Argentina!');
    expect(headlineOf(h({ trophies: ['Finalissima'], awards: [] }))).toMatch(/Finalissima/);
    expect(headlineOf(h({ trophies: ['Liga Profesional'], awards: [] }))).toMatch(/campeón|Salís/i);
    expect(headlineOf(h({ injury: 'grave', trophies: [], awards: [] }))).toMatch(/grave|rodilla/i);
    expect(headlineOf(h({ promo: 'down', injury: null, trophies: [], awards: [] }))).toMatch(/Descenso/);
    // en todas las carreras, cada temporada trae un titular de ocho palabras o menos y nada de párrafos
    for (const seed of seeds(40)) for (const x of simulateRun(seed).history) { expect(x.head.length).toBeGreaterThan(5); expect(x.head.split(/\s+/).length, x.head).toBeLessThanOrEqual(11); expect(x.near.length).toBeLessThan(60); }
  });
  it('los hitos: debut, primer gol, Selección y títulos salen una sola vez en la carrera', () => {
    const seen: Record<string, number> = {};
    for (const seed of seeds(120)) {
      const c = simulateRun(seed, { nat: 'ar' });
      const own: Record<string, number> = {};
      for (const h of c.history) for (const m of h.miles) own[m] = (own[m] ?? 0) + 1;
      for (const [m, n] of Object.entries(own)) { seen[m] = (seen[m] ?? 0) + 1; if (!/^(home|idol|ballon|wc)$/.test(m)) expect(n, m).toBe(1); }
    }
    for (const m of ['debut', 'goal1', 'caps1', 'title1', 'europe']) expect(seen[m] ?? 0, m).toBeGreaterThan(10);
    expect(nice('DE PAUL')).toBe('De Paul');
    expect(milesOf({ ...simulateRun(5), history: [] } as Career)).toEqual([]);
  });
  it('lo que quedó cerca: el escalón que falta, el OVR redondo o tu mejor carrera', () => {
    expect(endNear(130, 1, 70, null)).toMatch(/A 5 pts de Ídolo de barrio/);
    expect(endNear(20, 0, 88, null)).toMatch(/Te faltaron 2 de OVR para los 90/);
    expect(endNear(100, 1, 70, 110)).toMatch(/A 10 pts de tu mejor carrera/);
    expect(endNear(10, 0, 60, null)).toBe('');
    expect(nearOf({ ...simulateRun(9), history: [] } as Career)).toBe('');
  });
  it('migra las carreras de la versión 3: queda jugable (con una decisión nueva) y nunca se rompe con lo viejo', () => {
    const mid = find(x => x.phase === 'decide' && x.history.length > 3 && !x.tension);
    const old = JSON.parse(JSON.stringify(mid)) as any;
    old.v = 3;
    old.queue = [{ id: 'plan', title: 'x', text: 'y', options: [{ id: 'a', label: 'a', hint: 'h', fx: {} }, { id: 'b', label: 'b', hint: 'h', fx: {} }, { id: 'c', label: 'c', hint: 'h', fx: {} }] }];
    old.history = old.history.map((h: any) => { const { ev, kind, risk, say, head, near, miles, ...rest } = h; return rest; });
    delete old.pk; delete old.last;
    const m = parseCareer(JSON.stringify(old))!;
    expect(m).not.toBeNull();
    expect(m.v).toBe(4);
    expect(m.history.length).toBe(mid.history.length);
    expect(m.history.every(h => h.head.length > 0)).toBe(true);
    expect(m.phase).toBe('decide');
    expect(m.queue.length).toBe(1); expect(m.queue[0].options.length).toBe(2);
    const next = choose(m, 'safe');
    expect(['result', 'decide']).toContain(next.phase);
    // en resultado, en final pendiente y terminada
    const res = find(x => x.phase === 'result');
    const o2 = JSON.parse(JSON.stringify(res)); o2.v = 3; o2.history = o2.history.map((h: any) => { const { ev, kind, risk, say, head, near, miles, ...rest } = h; return rest; });
    expect(parseCareer(o2)!.phase).toBe('result');
    const fin = find(x => !!x.tension, 3000);
    const o3 = JSON.parse(JSON.stringify(fin)); o3.v = 3; o3.history = o3.history.map((h: any) => { const { ev, kind, risk, say, head, near, miles, ...rest } = h; return rest; });
    const m3 = parseCareer(o3)!;
    expect(m3.phase).toBe('result'); expect(m3.tension ?? null).toBeNull();
    const done = JSON.parse(JSON.stringify(simulateRun(42))); done.v = 3; done.history = done.history.map((h: any) => { const { ev, kind, risk, say, head, near, miles, ...rest } = h; return rest; });
    expect(parseCareer(done)!.phase).toBe('over');
  });
  it('las estrellas de potencial van de 1 a 5 y no bajan al subir el potencial', () => {
    let prev = 1;
    for (let p = 50; p <= 99; p++) { const s = potentialStars(p); expect(s).toBeGreaterThanOrEqual(prev); expect(s).toBeLessThanOrEqual(5); prev = s; }
    expect(potentialStars(50)).toBe(1); expect(potentialStars(95)).toBe(5);
  });
  it('con la carta, el OVR de arranque sube con el promedio real y queda entre 45 y 60', () => {
    expect(youthTarget(50)).toBeLessThan(youthTarget(90));
    expect(Math.round(youthTarget(70))).toBeGreaterThanOrEqual(45);
    expect(Math.round(youthTarget(90))).toBeLessThanOrEqual(60);
  });
});

describe('mejor carrera y guardado en el dispositivo', () => {
  it('bestOf resume la carrera y parseBest la valida', () => {
    const c = simulateRun(2468);
    const b = bestOf(c);
    expect(b.seed).toBe(c.seed);
    expect(b.label).toBe(legacy(c).label);
    expect(b.score).toBe(legacy(c).score);
    expect(b.seasons).toBe(c.history.length);
    expect(parseBest(JSON.stringify(b))).toEqual(b);
    for (const bad of [null, '', '{', 5, {}, { ...b, pos: 'X' }, { ...b, score: NaN }, { ...b, name: 5 }, { ...b, v: 1 }, { ...b, v: 2 }, { ...b, v: undefined }, { ...b, d: 'facil' }, { ...b, num: 'x' }]) expect(parseBest(bad)).toBeNull();
  });

  it('guarda y recupera la carrera en curso y la mejor', () => {
    const st = fakeStorage();
    vi.stubGlobal('localStorage', st);
    try {
      expect(loadRun('u1')).toBeNull();
      const mid = find(x => x.phase === 'decide' && x.history.length > 2);
      saveRun(mid, 'u1');
      expect(loadRun('u1')).toEqual(mid);
      saveRun(null, 'u1');
      expect(st.map.has(runKey('u1'))).toBe(false);
      expect(loadRun('u1')).toBeNull();

      expect(loadBest('u1')).toBeNull();
      const done = simulateRun(99);
      expect(recordIfBest(mid, null, 'u1')).toBeNull(); // una carrera sin terminar no cuenta
      const first = recordIfBest(done, null, 'u1')!;
      expect(first.score).toBe(legacy(done).score);
      expect(first.d).toBe('normal');
      expect(loadBest('u1')).toEqual(first);
      // la mejor es por dificultad: una carrera en Experto no pisa la de Normal
      const hard = simulateRun(99, { diff: 'experto' });
      const bh = recordIfBest(hard, null, 'u1')!;
      expect(bh.d).toBe('experto');
      expect(loadBest('u1', 'normal')).toEqual(first); expect(loadBest('u1', 'experto')).toEqual(bh); expect(loadBest('u1', 'intenso')).toBeNull();
      // una peor no pisa a la mejor; una mejor sí
      const worse = { ...first, score: first.score - 10 };
      expect(recordIfBest(JSON.parse(JSON.stringify({ ...done })) as Career, worse, 'u1')!.score).toBe(first.score);
      const better = { ...first, score: first.score - 1 };
      expect(recordIfBest(done, better, 'u1')!.score).toBe(first.score);
      expect(recordIfBest(done, first, 'u1')).toBe(first);
    } finally { vi.unstubAllGlobals(); }
  });
  it('lo guardado es de cada perfil: otra cuenta en el mismo celular no retoma tu carrera ni ve tu mejor marca', () => {
    const st = fakeStorage();
    vi.stubGlobal('localStorage', st);
    try {
      const mid = find(x => x.phase === 'decide' && x.history.length > 2);
      const done = simulateRun(99);
      saveRun(mid, 'ana');
      const best = recordIfBest(done, null, 'ana')!;
      expect(loadRun('ana')).toEqual(mid);
      expect(loadBest('ana')).toEqual(best);
      for (const other of ['beto', undefined, null]) { expect(loadRun(other)).toBeNull(); expect(loadBest(other)).toBeNull(); }
      expect(new Set([runKey('ana'), runKey('beto'), runKey()]).size).toBe(3);
      expect(bestKey('ana')).not.toBe(bestKey('beto'));
      expect(bestKey('ana', 'normal')).not.toBe(bestKey('ana', 'experto'));
      // Sin perfil igual funciona (un cajón común), sin pisar el de nadie
      saveRun(done, undefined);
      expect(loadRun()).toEqual(done);
      expect(loadRun('ana')).toEqual(mid);
      // Lo que quedó de antes, sin perfil, ya no se lee
      st.map.set(RUN_KEY, JSON.stringify(mid)); st.map.set(BEST_KEY, JSON.stringify(best));
      expect(loadRun('carla')).toBeNull(); expect(loadBest('carla')).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('el resumen de Inicio se guarda aparte y chico, por perfil, y se mantiene al día', () => {
    const st = fakeStorage();
    vi.stubGlobal('localStorage', st);
    try {
      const mid = find(x => x.phase === 'decide' && x.history.length > 2);
      const done = simulateRun(99);
      expect(loadSummary('ana')).toEqual(EMPTY_SUMMARY);
      saveRun(mid, 'ana');
      expect(loadSummary('ana').run).toEqual({ name: mid.name, season: mid.history.length + 1 });
      expect(JSON.stringify(loadSummary('ana')).length).toBeLessThan(150);
      const res = find(x => x.phase === 'result');
      saveRun(res, 'ana');
      expect(loadSummary('ana').run).toEqual({ name: res.name, season: res.history.length });
      const best = recordIfBest(done, null, 'ana')!;
      expect(loadSummary('ana').best).toEqual({ normal: { label: best.label, score: best.score } });
      saveRun(done, 'ana'); // terminada: ya no hay carrera en curso, pero la mejor se mantiene
      expect(loadSummary('ana')).toEqual({ ...EMPTY_SUMMARY, best: { normal: { label: best.label, score: best.score } } });
      expect(loadSummary('beto')).toEqual(EMPTY_SUMMARY);
      expect(loadSummary()).toEqual(EMPTY_SUMMARY);
      // Basura en el resumen: se lee vacío, sin errores
      for (const junk of ['no es json', '[]', '{"v":3,"run":{"name":5,"season":"x"},"best":{"label":1}}', 'null', '{"run":{"name":"Viejo","season":3},"best":{}}']) {
        st.map.set(summaryKey('ana'), junk);
        expect(loadSummary('ana')).toEqual(EMPTY_SUMMARY);
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it('un storage roto o con basura no tira error: el juego sigue, sin guardar', () => {
    vi.stubGlobal('localStorage', fakeStorage({ broken: true }));
    try {
      expect(loadRun('u1')).toBeNull();
      expect(loadBest('u1')).toBeNull();
      expect(loadSummary('u1')).toEqual(EMPTY_SUMMARY);
      expect(() => saveRun(simulateRun(5), 'u1')).not.toThrow();
      expect(() => saveRun(null, 'u1')).not.toThrow();
      expect(() => saveBest(bestOf(simulateRun(5)), 'u1')).not.toThrow();
      expect(recordIfBest(simulateRun(5), null, 'u1')).not.toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
    const junk = fakeStorage();
    junk.map.set(runKey('u1'), '{"v":1,"roto":true}'); junk.map.set(bestKey('u1'), 'no es json');
    vi.stubGlobal('localStorage', junk);
    try { expect(loadRun('u1')).toBeNull(); expect(loadBest('u1')).toBeNull(); } finally { vi.unstubAllGlobals(); }
  });
  it('sin storage en absoluto (ni existe localStorage) tampoco rompe', () => {
    expect(typeof localStorage).toBe('undefined');
    expect(loadRun('u1')).toBeNull();
    expect(loadSummary('u1')).toEqual(EMPTY_SUMMARY);
    expect(() => saveRun(simulateRun(3), 'u1')).not.toThrow();
  });
  it('la tarjeta de Inicio no trae el simulador: CareerEntry y careerSummary no importan el juego ni el store', () => {
    const src = import.meta.glob<string>(['./CareerEntry.tsx', './careerSummary.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(src).length).toBe(2);
    for (const [file, text] of Object.entries(src)) {
      const imports = [...text.matchAll(/^\s*(?:import|export)\b[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
      for (const from of imports) expect(from, `${file} importa ${from}`).not.toMatch(/career(Core|Data|Events|Base|Store|Rng|Types|World|Nations|Achievements|Comps|Setup|Value|Fx|Challenge|Logos|Cosmetics|Trophies)|Career(Visuals|Page|Ach|End|Start|Seasons)|useCareer|shared\/teams/);
    }
  });
});
