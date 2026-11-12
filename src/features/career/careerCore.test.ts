import { describe, expect, it, vi } from 'vitest';
import { ATTRS, POS, type Stats } from '../../shared/model';
import { AWARD, AWARD_PTS, LEGACY_STEPS, POS_LABEL, POS_W, TROPHY_PTS, contMvp, lgAward } from './careerData';
import { BEST_KEY, RUN_KEY, bestKey, loadBest, loadRun, recordIfBest, runKey, saveBest, saveRun } from './careerStore';
import { loadSummary, summaryKey } from './careerSummary';
import { DEFAULT_YEAR, remainingGrowth, seasonYear } from './careerBase';
import { eliminatedAt, natTournament, runTournament } from './careerComps';
import { drawEvents, olyChance, selecChance } from './careerEvents';
import {
  CLUBS, CLUB_BY_NAME, CONTS, CONT_IDS, INTL, LEAGUES, LEAGUE_IDS, asClub, clubNamed, clubsOf, gamesCap, isClubWorldCupYear, isCopaYear, isFinalissimaYear,
  finishRank, isOlympicYear, isWorldCupYear, qualByStrength, qualFor, sizeOf, tierOf, youthClub,
} from './careerWorld';
import { KITS, TEAMS_ASCENSO, TEAMS_PRIMERA } from '../../shared/teams';
import { Rng, seedState } from './careerRng';
import {
  MAX_AGE, MAX_STAT, MIN_STAT, RETIRE_FROM, advance, ageCurve, canRetire, cardStart, careerOvr, choose, currentEvent, fxTags, legacy, legacyOf,
  legacyScore, newCareer, parseBest, parseCareer, potentialStars, randomPicker, retireFloor, retireNow, seasonTitle, shareText, simulateRun, tally, totals, youthTarget, bestOf,
  type Career, type Club, type EventInst, type Picker, type SeasonLog,
} from './careerCore';

const flat = (n: number): Stats => ({ rit: n, tir: n, pas: n, reg: n, def: n, fis: n });
const first: Picker = (_c, ev) => ev.options[0].id;
const seeds = (n: number, k = 7919) => Array.from({ length: n }, (_, i) => (i + 1) * k);

/** Decide bien: entrena de joven y se cuida de grande, va a la Selección, se hace cargo de la lesión y ficha solo para subir. */
const smart: Picker = (c, ev) => {
  const ids = ev.options.map(o => o.id);
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'train' : 'care';
    case 'selec': case 'oly': case 'abroad': return 'go';
    case 'comeback': return 'slow';
    case 'mentor': case 'captain': return 'yes';
    case 'coach': return 'talk';
    case 'debut': return ids.includes('up') ? 'up' : 'home';
    case 'loan': return 'loan';
    case 'cash': return 'stay';
    case 'home': return c.age >= 34 ? 'back' : 'stay';
    case 'transfer': {
      const best = ev.options.filter(o => o.fx.move).sort((a, b) => b.fx.move!.club.pw - a.fx.move!.club.pw)[0];
      return best && best.fx.move!.club.pw > c.club.pw ? best.id : 'stay';
    }
    default: return ev.options[0].id;
  }
};
/** Decide mal: sale de joda, rechaza la Selección, se apura con las lesiones y nunca se mueve de club. */
const bad: Picker = (c, ev) => {
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'party' : 'train';
    case 'selec': case 'oly': return 'rest';
    case 'comeback': return 'fast';
    case 'coach': return 'press';
    case 'debut': return 'home';
    case 'transfer': case 'abroad': case 'cash': return 'stay';
    default: return ev.options[ev.options.length - 1].id;
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
  it('cada temporada hay una decisión (a veces dos), con 2 a 4 opciones y su pista', () => {
    let two = 0, total = 0;
    for (const seed of seeds(30)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && c.picks.length === 0) {
          total++;
          if (c.queue.length >= 2) two++;
          expect(c.queue.length).toBeGreaterThanOrEqual(1);
          expect(c.queue.length).toBeLessThanOrEqual(2);
          for (const ev of c.queue) {
            expect(ev.options.length).toBeGreaterThanOrEqual(2); expect(ev.options.length).toBeLessThanOrEqual(4);
            expect(new Set(ev.options.map(o => o.id)).size).toBe(ev.options.length);
            expect(ev.options.every(o => o.label && o.hint)).toBe(true);
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(two / total).toBeGreaterThan(0.1);
    expect(two / total).toBeLessThan(0.7);
  });
  it('las etiquetas de una opción cuentan lo que hace', () => {
    expect(fxTags({ growth: 0.9, injury: 0.05 }).map(t => t.t)).toEqual(['Crecés más', 'Más riesgo de lesión']);
    expect(fxTags({}).length).toBe(0);
    expect(fxTags({ gamble: { p: 0.5, okText: '', badText: '' } }).some(t => t.t === 'Con riesgo')).toBe(true);
  });
  it('los obligatorios salen SIEMPRE, en cualquier semilla: el debut a los 19 en inferiores y la vuelta tras una lesión grave', () => {
    let debuts = 0, comebacks = 0;
    for (const seed of seeds(500, 31)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'T', pos: POS[seed % 4], style: 'potrero' });
      let afterGrave = false;
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && c.picks.length === 0 && c.age >= 19 && c.club.tier === 0) {
          debuts++;
          const debut = c.queue.find(e => e.id === 'debut');
          expect(debut).toBeDefined();
          expect(debut!.options.length).toBeGreaterThanOrEqual(2);
          if (!afterGrave) expect(c.queue[0].id).toBe('debut'); // el obligatorio se elige primero, no queda a la suerte del sorteo
        }
        if (c.phase === 'result') {
          afterGrave = c.history[c.history.length - 1].injury === 'grave' && !c.retire;
          if (afterGrave) {
            comebacks++;
            const ids = advance(c).queue.map(e => e.id);
            expect(ids).toContain('comeback');
            if (!ids.includes('debut')) expect(ids[0]).toBe('comeback');
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(debuts).toBeGreaterThan(100);
    expect(comebacks).toBeGreaterThan(10);
  });
  it('si coinciden dos obligatorios de grupos distintos (debut + vuelta de una lesión grave) salen los dos, sin pasar de dos decisiones', () => {
    for (const seed of seeds(300)) {
      const base = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      const ev = drawEvents({ ...base, age: 19, lastInjury: 'grave' }, new Rng(seedState(seed)));
      expect(ev.map(e => e.id).sort()).toEqual(['comeback', 'debut']);
    }
  });
  it('el cambio de puesto nombra el puesto en palabras, no con la sigla', () => {
    const c = find(x => x.phase === 'decide' && x.queue.some(e => e.id === 'switch'), 900);
    const ev = c.queue.find(e => e.id === 'switch')!;
    const yes = ev.options.find(o => o.id === 'yes')!;
    expect(yes.label).toMatch(/^Aceptar el cambio a (defensor|mediocampista|delantero)$/);
    expect(yes.label).toContain(POS_LABEL[yes.fx.pos!].toLowerCase());
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
  it('aceptar una oferta te manda al club y la categoría de la oferta', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'transfer' && x.queue[0].options.some(o => o.fx.move));
    const offer = c.queue[0].options.find(o => o.fx.move)!;
    const club = offer.fx.move!.club;
    const played = finish(choose(c, offer.id));
    expect(played.history[played.history.length - 1].club).toBe(club.name);
    expect(played.history[played.history.length - 1].tier).toBe(club.tier);
  });
  it('quedarte en el club no te mueve', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'transfer');
    const stay = c.queue[0].options.find(o => o.id === 'stay')!;
    expect(stay.fx.move).toBeUndefined();
    const played = finish(choose(c, 'stay'));
    expect(played.history[played.history.length - 1].club).toBe(c.club.name);
  });
  it('las ofertas son de clubes reales, distintos del tuyo y entre sí', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'transfer' && x.queue[0].options.filter(o => o.fx.move).length >= 2);
    const names = c.queue[0].options.filter(o => o.fx.move).map(o => o.fx.move!.club.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(c.club.name);
    const clubs = c.queue[0].options.filter(o => o.fx.move).map(o => o.fx.move!.club);
    for (const k of clubs) {
      expect(CLUB_BY_NAME.has(k.name)).toBe(true);
      expect(k.tier).toBeGreaterThanOrEqual(1); expect(k.tier).toBe(tierOf(k.pw));
      expect(LEAGUES[k.lg].name).toBeTruthy();
    }
  });
  it('el préstamo te lleva a otro club y después volvés al de origen', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'loan');
    const parent = c.club;
    const n = finish(choose(c, 'loan'));
    expect(n.phase).toBe('result');
    expect(n.history[n.history.length - 1].club).not.toBe(parent.name);
    expect(n.loan?.name).toBe(parent.name);
    const next = advance(n);
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
    const c = find(x => x.phase === 'result' && !x.loan && x.history[x.history.length - 1].lg === 'ar1' && x.history[x.history.length - 1].fin > sizeOf('ar1') - 3, 1500);
    expect(c.club.lg).toBe('ar2');
    expect(c.notes.join(' ')).toContain('descendió');
    expect(c.qual).toBeNull();
  });
  it('volver al club de las inferiores te lleva a ese club, con la fuerza que tiene hoy', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'home', 900);
    expect(c.age).toBeGreaterThanOrEqual(31);
    const n = finish(choose(c, 'back'));
    const last = n.history[n.history.length - 1];
    expect(last.club).toBe(c.home);
    expect(last.tier).toBe(clubNamed(c.home)!.tier);
    expect(n.returned).toBe(true);
  });
  it('la vuelta al club de la infancia suma al Legado recién cuando se juega esa temporada: retirarse antes no da el bonus', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'home', 900);
    // Armamos una temporada con una segunda decisión (cualquiera), para poder retirarse con la vuelta ya elegida
    const extra = newCareer({ seed: 5, name: 'x', pos: 'MED', style: 'potrero' }).queue[0];
    const two: Career = { ...c, age: Math.max(c.age, RETIRE_FROM), queue: [c.queue[0], extra] };
    const mid = choose(two, 'back');
    expect(mid.phase).toBe('decide');
    expect(mid.returned).toBe(false);
    expect(canRetire(mid)).toBe(true);
    const quit = retireNow(mid);
    expect(quit.phase).toBe('over');
    expect(quit.returned).toBe(false);
    expect(legacyScore(quit)).toBe(legacyScore(retireNow(two)));
    // Si se juega la temporada, ahora sí cuenta (+8)
    const played = finish(mid);
    expect(played.returned).toBe(true);
    expect(played.returning).toBe(false);
    expect(legacyScore(played)).toBe(legacyScore({ ...played, returned: false }) + 8);
    // Y elegir otro club después no deja la marca colgada
    expect(choose(two, 'stay').returning).toBe(false);
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
    expect(natTournament(2026)!.t).toBe(INTL.worldCup); expect(natTournament(2028)!.t).toBe(INTL.copaAmerica); expect(natTournament(2029)).toBeNull();
    // Con otro año de arranque, el calendario se corre pero se respeta
    for (const y0 of [2025, 2026, 2027, 2029]) expect(seasonYear({ y0, age: 19 })).toBe(y0 + 2);
  });
  it('quien va a la Selección suma partidos; quien pide descanso, no', () => {
    const c = find(x => x.phase === 'decide' && x.queue[x.queue.length - 1].id === 'selec', 900);
    const go = finish(c, 'selec', 'go'), rest = finish(c, 'selec', 'rest');
    expect(go.history[go.history.length - 1].caps).toBeGreaterThan(0);
    expect(rest.history[rest.history.length - 1].caps).toBe(0);
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
    expect(LEGACY_STEPS.map(s => s.label)).toEqual(['Promesa perdida', 'Jugador de club', 'Ídolo', 'Leyenda', 'Mejor de la historia']);
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
    const counts = [0, 0, 0, 0, 0];
    const n = 600;
    for (const seed of seeds(n)) counts[legacy(simulateRun(seed)).index]++;
    expect(counts.every(x => x > 0)).toBe(true);
    expect(counts[4] / n).toBeLessThan(0.1);
    expect(counts[0] / n).toBeGreaterThan(0.05); expect(counts[0] / n).toBeLessThan(0.35);
    expect(counts[4]).toBeLessThan(counts[3]); expect(counts[3]).toBeLessThan(counts[2] + counts[1]);
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
  it('tabla de Legado en 1000 carreras: al azar, bien jugadas y mal jugadas. El escalón más alto es raro, y casi imposible jugando mal', () => {
    const table = (p: Picker | undefined) => {
      const counts = [0, 0, 0, 0, 0];
      for (const seed of seeds(1000)) counts[legacy(simulateRun(seed, { pick: p })).index]++;
      return counts.map(x => x / 1000);
    };
    const random = table(undefined), good = table(smart), poor = table(bad);
    // el escalón más alto: 3-7 % con buen juego, menos de 1 % con mal juego (con un poco de margen por el azar de la muestra)
    expect(good[4]).toBeGreaterThan(0.02); expect(good[4]).toBeLessThan(0.09);
    expect(random[4]).toBeLessThan(0.07);
    expect(poor[4]).toBeLessThan(0.015);
    expect(good[4]).toBeGreaterThan(poor[4]);
    // y todos los demás escalones existen para todos
    for (const t of [random, good, poor]) { expect(t.every(x => x > 0 || t === poor)).toBe(true); expect(t[0] + t[1]).toBeGreaterThan(0.25); expect(t[0]).toBeLessThan(0.3); }
    // jugar bien mueve a la gente hacia arriba
    const up = (t: number[]) => t[3] + t[4];
    expect(up(good)).toBeGreaterThan(up(poor));
  });
  it('decidir bien importa: entrenar de joven y cuidarse de grande rinde más que salir de joda', () => {
    const train: Picker = (c, ev) => (ev.id === 'plan' ? (c.age <= 28 ? 'train' : 'care') : ev.options[0].id);
    const party: Picker = (c, ev) => (ev.id === 'plan' ? (c.age <= 28 ? 'party' : 'train') : ev.options[0].id);
    const peak = (p: Picker) => seeds(250).reduce((t, s) => t + totals(simulateRun(s, { pick: p })).peak, 0) / 250;
    expect(peak(train)).toBeGreaterThan(peak(party) + 1);
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
    expect(txt).toContain(c.name);
    expect(txt).toContain(legacy(c).label);
    expect(txt).toContain(`OVR máximo: ${t.peak}`);
    expect(txt).toContain('https://ejemplo.test/#/juegos/carrera');
    expect(txt).not.toMatch(/undefined|NaN/);
    const gk = simulateRun(1234, { pos: 'ARQ' });
    expect(shareText(gk, 'x')).toContain('vallas invictas');
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
      'Marsella', 'Lyon', 'Mónaco', 'Lille', 'Benfica', 'Porto', 'Sporting Lisboa', 'Ajax', 'PSV', 'Feyenoord', 'Galatasaray', 'Fenerbahçe', 'Besiktas'];
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
    for (const t of [INTL.worldCup, INTL.copaAmerica, INTL.olympics, INTL.finalissima, INTL.clubWorldCup]) expect(TROPHY_PTS[t.name]).toBeGreaterThan(0);
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

  it('en 400 carreras (al azar y bien jugadas, con distintos años de arranque) cada título y premio respeta las reglas de su competencia', () => {
    const seen: Record<string, number> = {};
    const bump = (k: string) => { seen[k] = (seen[k] ?? 0) + 1; };
    const trophyNames = new Set(Object.keys(TROPHY_PTS)), awardNames = new Set(Object.keys(AWARD_PTS));
    const contNames = new Set(CONT_IDS.map(id => CONTS[id].name));
    seeds(400, 3571).forEach((seed, i) => {
      const c = simulateRun(seed, { pick: i % 2 ? smart : undefined, year: 2026 + (i % 4) });
      c.history.forEach((h, k) => {
        const year = c.y0 + h.age - 17, L = LEAGUES[h.lg], prev = c.history[k - 1];
        expect(CLUB_BY_NAME.has(h.club), h.club).toBe(true);
        expect(h.lg === 'inf').toBe(h.tier === 0);
        expect(h.fin).toBeGreaterThanOrEqual(1); expect(h.fin).toBeLessThanOrEqual(sizeOf(h.lg));
        if (h.cont) { expect(contNames.has(h.cont)).toBe(true); expect(CONT_IDS.find(id => CONTS[id].name === h.cont) && CONTS[CONT_IDS.find(id => CONTS[id].name === h.cont)!].conf).toBe(L.conf); }
        for (const t of h.trophies) {
          bump(t);
          expect(trophyNames.has(t), t).toBe(true);
          if (contNames.has(t)) expect(h.cont, t).toBe(t); // solo se gana la copa continental que se jugó
          else if (t === INTL.worldCup.name) { expect(isWorldCupYear(year)).toBe(true); expect(h.caps).toBeGreaterThanOrEqual(3); }
          else if (t === INTL.copaAmerica.name) { expect(isCopaYear(year)).toBe(true); expect(h.caps).toBeGreaterThanOrEqual(3); }
          else if (t === INTL.olympics.name) { expect(isOlympicYear(year)).toBe(true); expect(h.age).toBeLessThanOrEqual(23); }
          else if (t === INTL.finalissima.name) expect(isFinalissimaYear(year)).toBe(true);
          else if (t === INTL.clubWorldCup.name) {
            expect(isClubWorldCupYear(year)).toBe(true);
            expect(prev?.club).toBe(h.club); // el campeón continental del año anterior, con el mismo club
            expect(prev!.trophies.some(x => CWC_NAMES.includes(x))).toBe(true);
          } else if (t === L.name) expect(h.fin).toBe(1);
          else expect(t, 'copa nacional de otra liga').toBe(L.cup);
        }
        for (const a of h.awards) {
          bump(a);
          expect(awardNames.has(a), a).toBe(true);
          if (a === AWARD.ballon || a === AWARD.ballon2 || a === AWARD.ballon3) { expect(L.conf).toBe('uefa'); expect(h.tier).toBeGreaterThanOrEqual(4); }
          else if (a === AWARD.boot) expect(TOP5).toContain(h.lg);
          else if (a === AWARD.golden) { expect(h.age).toBeLessThanOrEqual(21); expect(L.conf).toBe('uefa'); }
          else if (a === AWARD.olimpiaPlata) expect(h.lg).toBe('ar1');
          else if (a === AWARD.wcStar) expect(h.trophies).toContain(INTL.worldCup.name);
          else if (a === AWARD.caStar) expect(h.trophies).toContain(INTL.copaAmerica.name);
          else if (CONT_IDS.some(id => a === contMvp(CONTS[id].name))) expect(a).toBe(contMvp(h.cont));
          else if (a.includes(': ')) expect(a.startsWith(L.name + ': ')).toBe(true);
        }
        // Los textos de la temporada
        const said = h.lines.join(' ');
        if (said.includes('Juegos Olímpicos')) { expect(isOlympicYear(year)).toBe(true); expect(h.age).toBeLessThanOrEqual(23); }
        if (/del Mundial\b(?! de Clubes)/.test(said)) expect(isWorldCupYear(year)).toBe(true);
        expect(said).not.toMatch(/undefined|NaN|\[object/);
        if (h.age > 23) expect(h.trophies).not.toContain(INTL.olympics.name);
      });
    });
    // y de todo eso pasa, no es solo teoría
    for (const t of ['Liga Profesional', 'Primera Nacional', 'Copa Argentina', 'Copa Libertadores', 'Copa Sudamericana', 'Champions League', 'Europa League', 'Premier League', 'LaLiga', 'Bundesliga',
      'Copa América', 'Mundial', 'Juegos Olímpicos', AWARD.ballon, AWARD.olimpiaPlata]) expect(seen[t] ?? 0, t).toBeGreaterThan(0);
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

  it('las ofertas de Arabia, la MLS y México traen su propio color; Europa le llega a los pibes con potencial', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'cash', 1500);
    const go = c.queue[0].options.find(o => o.id === 'go')!;
    const lg = go.fx.move!.club.lg;
    expect(['sa', 'us', 'mx']).toContain(lg);
    expect(c.queue[0].text).toContain(LEAGUES[lg].flavor);
    expect(go.hint).toMatch(/vidriera/);
    expect(c.age).toBeGreaterThanOrEqual(28);
    expect(LEAGUES.sa.flavor).toBe('Te llenan de plata, pero la vidriera es menor.');
    const e = find(x => x.phase === 'decide' && x.queue[0].id === 'abroad', 900);
    const club = e.queue[0].options.find(o => o.id === 'go')!.fx.move!.club;
    expect(LEAGUES[club.lg].conf).toBe('uefa');
    expect(club.tier).toBeGreaterThanOrEqual(3);
    expect(e.age).toBeLessThanOrEqual(23);
  });

  it('en los clubes de Europa las ofertas incluyen "Volver a tu club de inferiores" ya de grande, y el club es el mismo con el que arrancaste', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'home', 900);
    const back = c.queue[0].options.find(o => o.id === 'back')!;
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
    const bad: unknown[] = [null, undefined, 5, 'x', '{', '[]', {}, { v: 2 }, { ...c, v: 1 }, { ...c, v: 3 }, { ...c, pos: 'ZZZ' }, { ...c, style: 'x' }, { ...c, phase: 'nada' },
      { ...c, age: NaN }, { ...c, stats: { rit: 1 } }, { ...c, history: 'no' }, { ...c, club: null }, { ...c, club: { ...c.club, tier: 9 } },
      { ...c, mods: null }, { ...c, phase: 'decide', queue: [] }, { ...c, phase: 'decide', queue: [{ id: 'x', options: [] }] }];
    for (const b of bad) expect(parseCareer(b)).toBeNull();
  });
  it('una decisión pendiente sin opciones no se acepta: así no queda una carrera trabada', () => {
    const mid = find(x => x.phase === 'decide');
    const broken = JSON.parse(JSON.stringify(mid)) as Career;
    (broken.queue[0] as EventInst).options = [];
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
      const old = JSON.parse(JSON.stringify(mid)); old.v = 1; old.home = 'Sportivo Los Aromos'; old.club = { name: 'Sportivo Los Aromos', tier: 2, str: 1 };
      st.map.set(runKey('u1'), JSON.stringify(old));
      st.map.set(bestKey('u1'), JSON.stringify({ seed: 1, name: 'Viejo', pos: 'DEL', label: 'Ídolo', score: 300, peak: 80, seasons: 15, trophies: 5 }));
      st.map.set(summaryKey('u1'), JSON.stringify({ run: { name: 'Viejo', season: 7 }, best: { label: 'Ídolo', score: 300 } }));
      // la tarjeta de Inicio ya no muestra lo viejo, ni siquiera sin abrir el juego
      expect(loadSummary('u1')).toEqual({ run: null, best: null });
      expect(loadRun('u1')).toBeNull();
      expect(loadBest('u1')).toBeNull();
      expect(loadSummary('u1')).toEqual({ run: null, best: null });
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
  const log = (o: Partial<SeasonLog> = {}): SeasonLog => ({
    n: 1, age: 20, club: 'Colón', tier: 1, lg: 'ar2', fin: 4, cont: '', ovr0: 60, ovr: 62, pj: 20, goals: 5, assists: 2, cs: 0, rating: 7, role: 'Titular', trophies: [], awards: [],
    caps: 0, capGoals: 0, injury: null, captain: false, picks: [], lines: [], ...o,
  });
  it('tally cuenta repetidos y pone primero lo más valioso', () => {
    expect(tally(['FA Cup', 'Premier League', 'FA Cup'], TROPHY_PTS)).toEqual([['Premier League', 1], ['FA Cup', 2]]);
    expect(tally(['Champions League', 'Copa Argentina', 'Champions League', 'Champions League'], TROPHY_PTS)).toEqual([['Champions League', 3], ['Copa Argentina', 1]]);
    expect(tally(['a', 'b', 'b'])).toEqual([['b', 2], ['a', 1]]);
    expect(tally([])).toEqual([]);
  });
  it('el titular de la temporada cuenta lo más importante que pasó', () => {
    expect(seasonTitle(log({ awards: [AWARD.ballon] }))).toBe('¡Ganaste el Balón de Oro!');
    expect(seasonTitle(log({ trophies: ['Mundial'] }))).toBe('¡Campeón del mundo!');
    expect(seasonTitle(log({ trophies: ['Champions League'] }))).toBe('¡Campeón de Europa!');
    expect(seasonTitle(log({ trophies: ['Copa Libertadores'] }))).toBe('¡Campeón de América!');
    expect(seasonTitle(log({ trophies: ['Copa América'] }))).toBe('¡Campeón con la Selección!');
    expect(seasonTitle(log({ trophies: ['Liga Profesional', 'Copa Argentina'] }))).toBe('Temporada de ensueño');
    expect(seasonTitle(log({ trophies: ['Liga Profesional'] }))).toBe('¡Saliste campeón!');
    expect(seasonTitle(log({ injury: 'grave' }))).toBe('Un año para el olvido');
    expect(seasonTitle(log({ pj: 2 }))).toBe('Casi no jugaste');
    expect(seasonTitle(log({ rating: 8.3 }))).toBe('Una temporada brillante');
    expect(seasonTitle(log({ rating: 7.4 }))).toBe('Una buena temporada');
    expect(seasonTitle(log({ rating: 6.5 }))).toBe('Una temporada pareja');
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
    for (const bad of [null, '', '{', 5, {}, { ...b, pos: 'X' }, { ...b, score: NaN }, { ...b, name: 5 }, { ...b, v: 1 }, { ...b, v: undefined }]) expect(parseBest(bad)).toBeNull();
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
      expect(loadBest('u1')).toEqual(first);
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
      expect(loadSummary('ana')).toEqual({ run: null, best: null });
      saveRun(mid, 'ana');
      expect(loadSummary('ana').run).toEqual({ name: mid.name, season: mid.history.length + 1 });
      expect(JSON.stringify(loadSummary('ana')).length).toBeLessThan(150);
      const res = find(x => x.phase === 'result');
      saveRun(res, 'ana');
      expect(loadSummary('ana').run).toEqual({ name: res.name, season: res.history.length });
      const best = recordIfBest(done, null, 'ana')!;
      expect(loadSummary('ana').best).toEqual({ label: best.label, score: best.score });
      saveRun(done, 'ana'); // terminada: ya no hay carrera en curso, pero la mejor se mantiene
      expect(loadSummary('ana')).toEqual({ run: null, best: { label: best.label, score: best.score } });
      expect(loadSummary('beto')).toEqual({ run: null, best: null });
      expect(loadSummary()).toEqual({ run: null, best: null });
      // Basura en el resumen: se lee vacío, sin errores
      for (const junk of ['no es json', '[]', '{"run":{"name":5,"season":"x"},"best":{"label":1}}', 'null']) {
        st.map.set(summaryKey('ana'), junk);
        expect(loadSummary('ana')).toEqual({ run: null, best: null });
      }
    } finally { vi.unstubAllGlobals(); }
  });
  it('un storage roto o con basura no tira error: el juego sigue, sin guardar', () => {
    vi.stubGlobal('localStorage', fakeStorage({ broken: true }));
    try {
      expect(loadRun('u1')).toBeNull();
      expect(loadBest('u1')).toBeNull();
      expect(loadSummary('u1')).toEqual({ run: null, best: null });
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
    expect(loadSummary('u1')).toEqual({ run: null, best: null });
    expect(() => saveRun(simulateRun(3), 'u1')).not.toThrow();
  });
  it('la tarjeta de Inicio no trae el simulador: CareerEntry y careerSummary no importan el juego ni el store', () => {
    const src = import.meta.glob<string>(['./CareerEntry.tsx', './careerSummary.ts'], { query: '?raw', import: 'default', eager: true });
    expect(Object.keys(src).length).toBe(2);
    for (const [file, text] of Object.entries(src)) {
      const imports = [...text.matchAll(/^\s*(?:import|export)\b[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
      for (const from of imports) expect(from, `${file} importa ${from}`).not.toMatch(/career(Core|Data|Events|Base|Store|Rng|Types)|useCareer|CareerPage/);
    }
  });
});
