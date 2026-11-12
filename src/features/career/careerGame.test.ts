// "De potrero a leyenda": pruebas de lo que se sumó sobre el mundo real: nacionalidad, dificultad, pie, posición en la cancha, valor de mercado,
// efectos honestos de cada opción, logros, récords, Desafío del día, momentos clave, desbloqueables, escudos y el balance de una carrera argentina.
import { describe, expect, it } from 'vitest';
import { ATTRS, POS } from '../../shared/model';
import {
  ACHIEVEMENTS, ACH_IDS, ACH_TOTAL, REC_KEYS, attemptKey, brokenRecords, emptyAch, evaluate, parseAch, progress, recordFinish, recordStart, recordsOf, unlockedCount,
  withUnlocked, type AchStats,
} from './careerAchievements';
import { careerOvr, expectedRole, ovrF, pl, seasonYear } from './careerBase';
import { dailySetup } from './careerChallenge';
import {
  advance, bestOf, choose, cleanNum, cleanSurname, dailyShareText, legacy, legacyBase, legacyOf, legacyScore, newCareer, parseBest, parseCareer, randomPicker, shareText,
  simulateRun, startOptsOf, totals, type Career, type EventInst, type Picker,
} from './careerCore';
import { COSMETICS, activeCosmetics, unlockedBy } from './careerCosmetics';
import { LEGAL_NOTICE, TROPHY_PTS } from './careerData';
import { NO_STREAK, argDay, dailySeed, dayBefore, isDay, nextStreak, streakShown } from './careerDaily';
import { drawEvents, olyChance, selecChance } from './careerEvents';
import { fxEffects, finalOdds, optionChips } from './careerFx';
import { CLUB_ESPN, COMP_LOGO, SIN_ESCUDO } from './careerLogos';
import { FLAG_CODE, NATIONS, NAT_CUPS, NAT_CUP_LIST, flagUrl, nationOf, pickHome } from './careerNations';
import { Rng, seedState } from './careerRng';
import { DIFFS, DIFF_LIST, DPOS_DEFAULT, DPOS_LIST, DPOS_POS, FOOT_LIST, FOOTS, dposFor, weightsOf } from './careerSetup';
import { ACH_TOTAL as SUMMARY_TOTAL } from './careerSummary';
import { fmtEuro, marketValue } from './careerValue';
import {
  CLUBS, CLUB_BY_NAME, CONTS, CONT_IDS, LEAGUES, LEAGUE_IDS, clubNamed, clubsOf, finishRank, gamesCap, isWorldCupYear, sizeOf,
} from './careerWorld';
import { ACH_TOTAL as ACH_TOTAL_MODULE } from './careerAchievements';
import type { DPos, Difficulty } from './careerTypes';
import careerEntrySrc from './CareerEntry.tsx?raw';
import careerDailySrc from './careerDaily.ts?raw';
import careerSummarySrc from './careerSummary.ts?raw';
import homePageSrc from '../home/HomePage.tsx?raw';

const seeds = (n: number, k = 7919) => Array.from({ length: n }, (_, i) => (i + 1) * k);

/** Decide bien (ver careerCore.test). */
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
    case 'final': return 'all';
    case 'transfer': {
      const best = ev.options.filter(o => o.fx.move).sort((a, b) => b.fx.move!.club.pw - a.fx.move!.club.pw)[0];
      return best && best.fx.move!.club.pw > c.club.pw ? best.id : 'stay';
    }
    default: return ev.options[0].id;
  }
};
/** Decide mal. */
const bad: Picker = (c, ev) => {
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'party' : 'train';
    case 'selec': case 'oly': return 'rest';
    case 'comeback': return 'fast';
    case 'coach': return 'press';
    case 'debut': return 'home';
    case 'transfer': case 'abroad': case 'cash': return 'stay';
    case 'final': return 'calm';
    default: return ev.options[ev.options.length - 1].id;
  }
};

function find(ready: (c: Career) => boolean, tries = 800, pick: Picker = randomPicker, o: Parameters<typeof newCareer>[0] extends infer T ? Partial<T> : never = {}): Career {
  for (const seed of seeds(tries, 31)) {
    const pr = new Rng(seedState(seed));
    let c = newCareer({ seed, name: 'T', pos: POS[seed % 4], style: 'potrero', ...o });
    for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
      if (ready(c)) return c;
      c = c.phase === 'result' ? advance(c) : choose(c, pick(c, c.queue[0], pr));
    }
  }
  throw new Error('no apareció la situación buscada');
}

describe('nacionalidad', () => {
  it('hay más de treinta países, con bandera, código de bandera de ESPN, camiseta y fuerza de su Selección; la Argentina va primera y después Sudamérica', () => {
    expect(NATIONS.length).toBeGreaterThanOrEqual(30);
    expect(NATIONS[0].id).toBe('ar');
    const firstNonSouth = NATIONS.findIndex(n => n.conf !== 'conmebol');
    expect(NATIONS.slice(0, firstNonSouth).every(n => n.conf === 'conmebol')).toBe(true);
    expect(NATIONS.slice(firstNonSouth).some(n => n.conf === 'conmebol')).toBe(false);
    expect(new Set(NATIONS.map(n => n.id)).size).toBe(NATIONS.length);
    for (const n of NATIONS) {
      expect(n.flag.length, n.id).toBeGreaterThan(1);
      expect(FLAG_CODE[n.id], n.id).toMatch(/^[a-z]{3}$/);
      expect(flagUrl(n.id)).toContain(`${FLAG_CODE[n.id]}.png`);
      expect(n.kit).toHaveLength(3);
      expect(n.pw).toBeGreaterThan(60); expect(n.pw).toBeLessThan(90);
      expect(['conmebol', 'uefa', 'concacaf', 'afc', 'caf']).toContain(n.conf);
    }
    for (const id of ['ar', 'uy', 'br', 'cl', 'co', 'py', 'ec', 'mx', 'us', 'sa', 'es', 'en', 'it', 'de', 'fr', 'pt', 'nl', 'tr', 'be', 'bo', 'ca', 'hr', 'pe', 've', 'jp', 'kr', 'ma', 'sn', 'ng']) expect(NATIONS.some(n => n.id === id), id).toBe(true);
    expect(nationOf('zzz').id).toBe('ar'); // un país que no existe cae en la Argentina
  });
  it('arrancás en las inferiores de un club de tu país (o, sin liga propia, de tu región, y lo cuenta)', () => {
    for (const nat of ['ar', 'uy', 'br', 'es', 'mx', 'sa', 'us', 'fr', 'tr']) {
      const country = LEAGUES[nationOf(nat).lg!].country;
      for (const seed of seeds(25)) {
        const c = newCareer({ seed, name: 'x', pos: 'MED', style: 'tactico', nat });
        const home = CLUB_BY_NAME.get(c.home)!;
        if (nat === 'ar') expect(['ar1', 'ar2']).toContain(home.lg); else expect(LEAGUES[home.lg].country, nat).toBe(country);
        expect(c.notes.join(' ')).toContain(c.home);
        expect(c.notes.join(' ')).not.toContain('Te viniste de chico');
      }
    }
    for (const [nat, regions] of [['bo', ['ar1', 'ar2', 'py', 'uy', 'cl']], ['jp', ['sa']], ['ma', ['fr', 'es', 'pt']], ['be', ['nl', 'en', 'fr', 'de']], ['ng', ['pt', 'fr', 'es', 'tr']]] as const) {
      for (const seed of seeds(25)) {
        const c = newCareer({ seed, name: 'x', pos: 'DEL', style: 'fisico', nat });
        expect(regions as readonly string[]).toContain(CLUB_BY_NAME.get(c.home)!.lg);
        expect(c.notes.join(' ')).toContain('Te viniste de chico');
      }
    }
    // el peso: pocos de los grandes argentinos
    const homes = seeds(500).map(s => newCareer({ seed: s, name: 'x', pos: 'MED', style: 'tactico' }).home);
    const grandes = new Set(['Boca Juniors', 'River Plate', 'Racing Club', 'Independiente', 'San Lorenzo', 'Vélez Sarsfield', 'Estudiantes de La Plata', "Newell's Old Boys", 'Rosario Central', 'Lanús', 'Argentinos Juniors']);
    expect(homes.filter(h => grandes.has(h)).length / 500).toBeLessThan(0.25);
    expect(homes.filter(h => CLUB_BY_NAME.get(h)!.lg === 'ar2').length / 500).toBeGreaterThan(0.25); // la Primera Nacional es un arranque frecuente
  });
  it('la Selección es la de tu país: el texto de la convocatoria y el de los partidos lo nombran', () => {
    const c = find(x => x.phase === 'decide' && x.queue.some(e => e.id === 'selec'), 1200, smart, { nat: 'uy' });
    expect(c.nat).toBe('uy');
    expect(c.queue.find(e => e.id === 'selec')!.text).toContain('la Selección de Uruguay');
    const done = finishSeason(c, 'go');
    expect(done.history[done.history.length - 1].lines.join(' ')).toContain('la Selección de Uruguay');
    const ar = find(x => x.phase === 'decide' && x.queue.some(e => e.id === 'selec'), 1200, smart);
    expect(ar.queue.find(e => e.id === 'selec')!.text).toContain('la Selección Argentina');
  });
  it('te convocan más o menos según la profundidad de tu Selección: más difícil en Brasil o Francia que en Paraguay o Arabia', () => {
    const base = newCareer({ seed: 2, name: 'x', pos: 'DEL', style: 'potrero' });
    const at = (nat: string) => ({ ...base, nat, age: 26, club: clubNamed('Boca Juniors')! });
    for (const ovr of [74, 78, 82]) {
      expect(selecChance(at('br'), ovr)).toBeLessThan(selecChance(at('ar'), ovr));
      expect(selecChance(at('ar'), ovr)).toBeLessThan(selecChance(at('uy'), ovr));
      expect(selecChance(at('uy'), ovr)).toBeLessThan(selecChance(at('py'), ovr));
      expect(selecChance(at('fr'), ovr)).toBeLessThan(selecChance(at('sa'), ovr));
    }
    expect(selecChance(at('py'), 52)).toBe(0);
    expect(selecChance(at('br'), 62)).toBe(0);
    expect(olyChance({ ...at('ar'), age: 19 }, 70)).toBeGreaterThan(olyChance({ ...at('br'), age: 19 }, 70));
  });
  it('cada confederación tiene su torneo de selecciones y su ciclo: Copa América y Eurocopa cada 4 años, Copa Oro y Copa Africana en años impares, Copa Asiática', () => {
    expect(NAT_CUPS.conmebol.name).toBe('Copa América'); expect(NAT_CUPS.uefa.name).toBe('Eurocopa'); expect(NAT_CUPS.concacaf.name).toBe('Copa Oro');
    expect(NAT_CUPS.afc.name).toBe('Copa Asiática'); expect(NAT_CUPS.caf.name).toBe('Copa Africana de Naciones');
    const years = Array.from({ length: 24 }, (_, i) => 2026 + i);
    expect(years.filter(NAT_CUPS.conmebol.year).slice(0, 3)).toEqual([2028, 2032, 2036]);
    expect(years.filter(NAT_CUPS.uefa.year).slice(0, 3)).toEqual([2028, 2032, 2036]); // mismo ciclo que la Copa América
    expect(years.filter(NAT_CUPS.concacaf.year).slice(0, 3)).toEqual([2027, 2029, 2031]);
    expect(years.filter(NAT_CUPS.caf.year).slice(0, 3)).toEqual([2027, 2029, 2031]);
    expect(years.filter(NAT_CUPS.afc.year).slice(0, 3)).toEqual([2027, 2031, 2035]);
    for (const t of NAT_CUP_LIST) { expect(TROPHY_PTS[t.name]).toBeGreaterThan(0); expect(COMP_LOGO[t.name], t.name).toBeTruthy(); }
    // en una carrera, solo se gana el torneo de la propia confederación y en su año
    for (const nat of ['ar', 'es', 'mx', 'jp', 'ma', 'br', 'fr']) {
      const N = nationOf(nat);
      for (const seed of seeds(60, 4441)) {
        const c = simulateRun(seed, { nat, pick: smart, year: 2026 });
        for (const h of c.history) {
          const y = c.y0 + h.age - 17;
          for (const t of h.trophies) { const cup = NAT_CUP_LIST.find(x => x.name === t); if (cup) { expect(cup.conf).toBe(N.conf); expect(cup.year(y)).toBe(true); } }
          for (const tour of h.tours) { const cup = NAT_CUP_LIST.find(x => tour.startsWith(x.name)); if (cup) expect(cup.conf).toBe(N.conf); }
        }
      }
    }
  });
  it('pagás adaptación solo si te vas a vivir a otro país que no sea el tuyo: debutar en otro club argentino, o volver a casa, no la tiene', () => {
    const c = find(x => x.phase === 'decide' && x.queue[0].id === 'debut', 300, randomPicker);
    const other = c.queue[0].options.find(o => o.id === 'other')!;
    expect(CLUB_BY_NAME.get(other.fx.move!.club.name)!.lg === 'ar1' || CLUB_BY_NAME.get(other.fx.move!.club.name)!.lg === 'ar2').toBe(true);
    expect(other.fx.gamble).toBeUndefined();
    expect(JSON.stringify(other)).not.toContain('adaptarte');
    // volver al club de las inferiores (siempre en tu país)
    const h = find(x => x.phase === 'decide' && x.queue[0].id === 'home', 900, randomPicker);
    expect(h.queue[0].options.find(o => o.id === 'back')!.fx.gamble).toBeUndefined();
    // irte a Europa sí
    const t = find(x => x.phase === 'decide' && x.queue[0].id === 'transfer' && x.queue[0].options.some(o => o.fx.move && LEAGUES[o.fx.move.club.lg].conf === 'uefa'), 900, randomPicker);
    const eu = t.queue[0].options.find(o => o.fx.move && LEAGUES[o.fx.move.club.lg].conf === 'uefa')!;
    expect(eu.fx.gamble?.okTag).toBeTruthy();
    // y un español que vuelve a España no se "adapta" a España
    const es = find(x => x.phase === 'decide' && x.queue[0].id === 'transfer' && x.club.lg !== 'es' && x.queue[0].options.some(o => o.fx.move?.club.lg === 'es'), 900, randomPicker, { nat: 'es' });
    expect(es.queue[0].options.find(o => o.fx.move?.club.lg === 'es')!.fx.gamble).toBeUndefined();
  });
  it('el Premio Olimpia es solo para quienes juegan en la Argentina, sean argentinos o no', () => {
    for (const nat of ['ar', 'uy', 'br', 'es']) for (const seed of seeds(80, 1237)) {
      const c = simulateRun(seed, { nat, pick: smart });
      for (const h of c.history) for (const a of h.awards) if (a === 'Olimpia de Plata') expect(h.lg).toBe('ar1');
    }
  });
});

/** Termina la temporada eligiendo `id` en la decisión que tenga esa opción y la primera en las demás. */
function finishSeason(c: Career, id: string): Career {
  let n = c;
  while (n.phase === 'decide') n = choose(n, n.queue[0].options.some(o => o.id === id) ? id : n.queue[0].options[0].id);
  return n;
}

describe('posición en la cancha, pie, camiseta', () => {
  it('las doce posiciones se juegan como ARQ/DEF/MED/DEL y "Usar mi perfil" las mapea (ARQ→POR, DEF→DFC, MED→MC, DEL→DC)', () => {
    expect(DPOS_LIST).toHaveLength(12);
    expect(DPOS_POS).toMatchObject({ POR: 'ARQ', DFC: 'DEF', LI: 'DEF', LD: 'DEF', MCD: 'MED', MC: 'MED', MI: 'MED', MD: 'MED', MCO: 'MED', EI: 'DEL', ED: 'DEL', DC: 'DEL' });
    expect(DPOS_DEFAULT).toEqual({ ARQ: 'POR', DEF: 'DFC', MED: 'MC', DEL: 'DC' });
    for (const p of POS) expect(DPOS_POS[DPOS_DEFAULT[p]]).toBe(p);
    for (const d of DPOS_LIST) {
      const c = newCareer({ seed: 5, name: 'x', pos: 'MED', style: 'tactico', dpos: d });
      expect(c.dpos).toBe(d); expect(c.pos).toBe(DPOS_POS[d]);
    }
    // sin posición, la del puesto
    expect(newCareer({ seed: 5, name: 'x', pos: 'DEF', style: 'tactico' }).dpos).toBe('DFC');
    // un lateral que pasa al medio queda de mediocampista del mismo lado
    expect(dposFor('LI', 'MED')).toBe('MI'); expect(dposFor('LD', 'DEL')).toBe('ED'); expect(dposFor('MC', 'DEL')).toBe('DC');
  });
  it('cada posición pesa un poco distinto las stats (y siempre suman 1), y el OVR sale de esos pesos', () => {
    for (const d of DPOS_LIST) {
      const w = weightsOf(DPOS_POS[d], d);
      expect(ATTRS.reduce((t, [k]) => t + w[k], 0)).toBeCloseTo(1, 10);
      for (const [k] of ATTRS) expect(w[k]).toBeGreaterThan(0);
    }
    const wide = { rit: 90, tir: 50, pas: 50, reg: 70, def: 50, fis: 50 };
    expect(ovrF(wide, 'DEF', 'LI')).toBeGreaterThan(ovrF(wide, 'DEF', 'DFC'));       // el lateral valora el ritmo
    expect(ovrF({ ...wide, rit: 50, def: 90 }, 'MED', 'MCD')).toBeGreaterThan(ovrF({ ...wide, rit: 50, def: 90 }, 'MED', 'MCO')); // el 5 valora la marca
    expect(ovrF({ ...wide, rit: 50, tir: 90 }, 'DEL', 'DC')).toBeGreaterThan(ovrF({ ...wide, rit: 50, tir: 90 }, 'DEL', 'EI'));     // el 9, el tiro
    expect(careerOvr(wide, 'DEF', 'LI')).toBe(Math.round(ovrF(wide, 'DEF', 'LI')));
    // una posición que no es de tu puesto no cambia nada
    expect(weightsOf('MED', 'DC')).toBe(weightsOf('MED'));
  });
  it('la posición se guarda y se valida: no puede ser de otro puesto', () => {
    const c = simulateRun(42, { dpos: 'LI' });
    expect(parseCareer(JSON.stringify(c))).toEqual(c);
    for (const bad of [{ ...c, dpos: 'XX' }, { ...c, dpos: 'DC' }, { ...c, dpos: undefined }]) expect(parseCareer(bad)).toBeNull();
  });
  it('el pie: el ambidiestro arranca con más regate y pase y menos techo; el zurdo recibe ofertas un poco más arriba', () => {
    const avg = (foot: 'der' | 'izq' | 'amb', f: (c: Career) => number) => seeds(80).reduce((t, s) => t + f(newCareer({ seed: s, name: 'x', pos: 'MED', style: 'tactico', foot })), 0) / 80;
    expect(avg('amb', c => c.stats.reg + c.stats.pas)).toBeGreaterThan(avg('der', c => c.stats.reg + c.stats.pas));
    expect(avg('amb', c => c.potential)).toBeLessThan(avg('der', c => c.potential) - 1.5);
    expect(avg('izq', c => c.potential)).toBeCloseTo(avg('der', c => c.potential), 5);
    expect(FOOT_LIST.map(f => f.id)).toEqual(['der', 'izq', 'amb']);
    expect(newCareer({ seed: 5, name: 'x', pos: 'MED', style: 'tactico', foot: 'izq' }).foot).toBe('izq');
    expect(newCareer({ seed: 5, name: 'x', pos: 'MED', style: 'tactico', foot: 'raro' as any }).foot).toBe('der');
    // la ventaja del zurdo se ve en el nivel de los clubes que ofrecen
    const lvl = (foot: 'der' | 'izq') => {
      let t = 0, n = 0;
      for (const seed of seeds(400, 313)) {
        const pr = new Rng(seedState(seed));
        let c = newCareer({ seed, name: 'x', pos: 'DEL', style: 'potrero', foot });
        for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
          if (c.phase === 'decide' && c.queue[0].id === 'transfer') for (const o of c.queue[0].options) if (o.fx.move) { t += o.fx.move.club.pw - careerOvr(c.stats, c.pos, c.dpos); n++; }
          c = c.phase === 'result' ? advance(c) : choose(c, smart(c, c.queue[0], pr));
        }
      }
      return t / n;
    };
    expect(lvl('izq')).toBeGreaterThan(lvl('der'));
  });
  it('apellido en mayúsculas (hasta 14), número de 1 a 99 y todo eso en el texto para compartir', () => {
    expect(cleanSurname('  Pérez   del Río de la Plata ')).toBe('PÉREZ DEL RÍO');
    expect(cleanSurname('x'.repeat(30))).toHaveLength(14);
    expect(cleanNum(7)).toBe(7); expect(cleanNum(0)).toBe(10); expect(cleanNum(100)).toBe(10); expect(cleanNum('9')).toBe(10); expect(cleanNum(undefined, 'POR')).toBe(1);
    const c = newCareer({ seed: 9, name: 'Lucho Peyraga', surname: 'peyraga', num: 77, pos: 'DEL', style: 'potrero', dpos: 'ED', foot: 'izq', nat: 'uy' });
    expect(c.surname).toBe('PEYRAGA'); expect(c.num).toBe(77);
    const done = simulateRun(9, { dpos: 'ED', foot: 'izq', nat: 'uy' });
    const txt = shareText(done, 'https://x.test');
    expect(txt).toContain(done.surname); expect(txt).toContain('#' + done.num); expect(txt).toContain(done.dpos); expect(txt).toContain('🇺🇾'); expect(txt).toContain('izquierda');
    // sin apellido, sale del nombre
    expect(newCareer({ seed: 9, name: 'Lucho Peyraga', pos: 'DEL', style: 'potrero' }).surname).toBe('PEYRAGA');
  });
});

describe('dificultad', () => {
  it('tres dificultades, cada vez más duras y con más multiplicador, y cada carrera guarda la suya', () => {
    expect(DIFF_LIST.map(d => d.id)).toEqual(['normal', 'intenso', 'experto']);
    expect(DIFFS.normal.mult).toBe(1); expect(DIFFS.intenso.mult).toBe(1.15); expect(DIFFS.experto.mult).toBe(1.3);
    for (const d of DIFF_LIST) expect(d.desc.length).toBeGreaterThan(20);
    const [a, b, c3] = DIFF_LIST;
    expect(a.minutes).toBeGreaterThan(b.minutes); expect(b.minutes).toBeGreaterThan(c3.minutes);
    expect(a.injury).toBeLessThan(b.injury); expect(b.injury).toBeLessThan(c3.injury);
    expect(a.awards).toBeGreaterThan(b.awards); expect(b.awards).toBeGreaterThan(c3.awards);
    expect(a.deals).toBeGreaterThan(b.deals); expect(b.deals).toBeGreaterThan(c3.deals);
    for (const d of ['normal', 'intenso', 'experto'] as const) expect(newCareer({ seed: 1, name: 'x', pos: 'DEL', style: 'potrero', diff: d }).diff).toBe(d);
    expect(newCareer({ seed: 1, name: 'x', pos: 'DEL', style: 'potrero', diff: 'facilongo' as any }).diff).toBe('normal');
    const pot = (d: Difficulty) => seeds(80).reduce((t, s) => t + newCareer({ seed: s, name: 'x', pos: 'MED', style: 'tactico', diff: d }).potential, 0) / 80;
    expect(pot('normal')).toBeGreaterThan(pot('intenso')); expect(pot('intenso')).toBeGreaterThan(pot('experto'));
  });
  it('el puntaje de Legado se multiplica por la dificultad y la pantalla final muestra de dónde sale', () => {
    const c = simulateRun(33, { diff: 'experto' });
    const l = legacy(c);
    expect(l.mult).toBe(1.3); expect(l.base).toBe(legacyBase(c)); expect(l.score).toBe(Math.round(legacyBase(c) * 1.3)); expect(legacyScore(c)).toBe(l.score);
    expect(legacyOf(l.score, l.base, l.mult).label).toBe(l.label);
    const n = { ...c, diff: 'normal' as const };
    expect(legacy(n).score).toBe(l.base);
  });
  it('tabla de Legado por dificultad (al azar, bien y mal jugado): la cima es rara y casi imposible en Experto', () => {
    const N = 500;
    const top = (d: Difficulty, p: Picker | undefined) => seeds(N, 7919).filter(s => legacy(simulateRun(s, { diff: d, pick: p })).index === 4).length / N;
    const good = { normal: top('normal', smart), intenso: top('intenso', smart), experto: top('experto', smart) };
    expect(good.normal).toBeGreaterThan(0.02); expect(good.normal).toBeLessThan(0.1);
    expect(good.experto).toBeLessThan(0.03);
    expect(good.normal).toBeGreaterThan(good.experto);
    expect(top('experto', bad)).toBeLessThan(0.01); expect(top('normal', bad)).toBeLessThan(0.015);
    expect(top('experto', undefined)).toBeLessThan(0.03);
  });
});

describe('valor de mercado', () => {
  const v = (ovr: number, age: number, lg: any, tier: any, potential = ovr + 8, rating = 7.2) => marketValue({ ovr, age, potential, lg, tier, rating });
  it('sube con el OVR, llega al pico a mediados de los veinte y cae después hasta casi nada a los 40', () => {
    for (let o = 45; o < 95; o++) expect(v(o + 1, 25, 'es', 5)).toBeGreaterThanOrEqual(v(o, 25, 'es', 5));
    const byAge = Array.from({ length: 25 }, (_, i) => v(80, 16 + i, 'es', 5, 82));
    const peakAge = 16 + byAge.indexOf(Math.max(...byAge));
    expect(peakAge).toBeGreaterThanOrEqual(23); expect(peakAge).toBeLessThanOrEqual(27);
    for (let a = 28; a < 40; a++) expect(v(80, a + 1, 'es', 5, 80)).toBeLessThanOrEqual(v(80, a, 'es', 5, 80)); // después del pico, siempre baja
    expect(v(60, 40, 'ar1', 2, 60)).toBeLessThan(60_000); expect(v(60, 40, 'ar1', 2, 60)).toBeGreaterThanOrEqual(20_000);
    expect(v(80, 36, 'es', 5, 80)).toBeLessThan(v(80, 28, 'es', 5, 80) / 3);
  });
  it('rangos razonables: unos €350 mil un pibe de 18 con 55, y de €100 a €250 millones un crack de 25 en un club de élite', () => {
    expect(v(55, 18, 'ar1', 2, 72)).toBeGreaterThan(200_000); expect(v(55, 18, 'ar1', 2, 72)).toBeLessThan(600_000);
    expect(v(90, 25, 'es', 5, 92, 8)).toBeGreaterThan(100_000_000); expect(v(90, 25, 'es', 5, 92, 8)).toBeLessThanOrEqual(250_000_000);
    expect(v(96, 26, 'en', 5, 96, 8.8)).toBeLessThanOrEqual(250_000_000);
    expect(v(75, 24, 'en', 4)).toBeGreaterThan(v(75, 24, 'ar1', 2)); // la liga cuenta
    expect(v(70, 22, 'ar1', 3, 85)).toBeGreaterThan(v(70, 22, 'ar1', 3, 70)); // el potencial, de joven
    expect(v(70, 31, 'ar1', 3, 90)).toBeCloseTo(v(70, 31, 'ar1', 3, 70), -3); // de grande ya no
  });
  it('nunca es negativo, ni NaN, ni infinito, aunque le pases cualquier cosa; y se escribe bien', () => {
    for (const ovr of [NaN, -5, 0, 1, 50, 99, 500, Infinity]) for (const age of [NaN, 0, 17, 30, 40, 90]) {
      const x = marketValue({ ovr, age, potential: NaN, lg: 'es', tier: 5, rating: NaN });
      expect(Number.isFinite(x) && x >= 20_000 && x <= 250_000_000, `${ovr}/${age}`).toBe(true);
    }
    expect(fmtEuro(350_000)).toBe('€350K'); expect(fmtEuro(1_200_000)).toBe('€1,2M'); expect(fmtEuro(12_000_000)).toBe('€12M'); expect(fmtEuro(150_000_000)).toBe('€150M');
    expect(fmtEuro(NaN)).toBe('€0K'); expect(fmtEuro(-1)).toBe('€0K');
  });
  it('cada temporada deja su valor y el pico queda en los totales', () => {
    const c = simulateRun(71, { pick: smart });
    expect(c.history.every(h => Number.isFinite(h.val) && h.val >= 20_000)).toBe(true);
    expect(totals(c).peakVal).toBe(Math.max(...c.history.map(h => h.val)));
    const peakSeason = c.history.reduce((best, h) => (h.val > best.val ? h : best));
    expect(peakSeason.age).toBeGreaterThanOrEqual(20); expect(peakSeason.age).toBeLessThanOrEqual(34);
    expect(c.history[c.history.length - 1].val).toBeLessThan(totals(c).peakVal);
  });
});

describe('efectos honestos de cada opción', () => {
  /** Cuánto cambia de verdad el OVR de la temporada al elegir esa opción, promediando muchas tiradas con el mismo punto de partida. */
  function measured(base: Career, optId: string, reps: number): number {
    let t = 0;
    for (let i = 0; i < reps; i++) {
      const c = { ...JSON.parse(JSON.stringify(base)) as Career, rng: seedState(i * 7919 + 13) };
      const n = finishSeason(c, optId);
      const h = n.history[n.history.length - 1];
      t += h.ovr - h.ovr0;
    }
    return t / reps;
  }
  it('el signo y el tamaño del cambio de OVR que se muestra coinciden con lo que pasa de verdad (comparado con "seguir el plan del club")', () => {
    let checked = 0;
    const kinds = new Set<string>();
    for (const seed of seeds(120, 977)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero' });
      for (let g = 0; g < 400 && c.phase !== 'over' && checked < 40; g++) {
        if (c.phase === 'decide' && c.queue.length === 1 && ['plan', 'mentor', 'derby', 'coach', 'captain', 'comeback'].includes(c.queue[0].id) && c.age >= 20) {
          const ev = c.queue[0], ref = ev.options.find(o => o.id === 'club') ?? ev.options.find(o => o.id === 'no') ?? ev.options.find(o => o.id === 'rest') ?? ev.options.find(o => o.id === 'work') ?? ev.options.find(o => o.id === 'slow');
          if (ref) {
            const baseShown = fxEffects(c, ref.fx).ovr.exp, baseReal = measured(c, ref.id, 60);
            for (const o of ev.options) if (o.id !== ref.id) {
              const shown = fxEffects(c, o.fx).ovr.exp - baseShown, real = measured(c, o.id, 60) - baseReal;
              expect(Math.abs(shown - real), `${ev.id}/${o.id}: se muestra ${shown.toFixed(2)}, pasa ${real.toFixed(2)}`).toBeLessThan(0.7);
              if (Math.abs(shown) >= 0.5) expect(Math.sign(real), `${ev.id}/${o.id} signo`).toBe(Math.sign(shown));
              kinds.add(`${ev.id}/${o.id}`); checked++;
            }
          }
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(checked).toBeGreaterThanOrEqual(25);
    expect(kinds.size).toBeGreaterThanOrEqual(6);
  });
  it('la probabilidad de que salga mal (o bien) que se muestra es la que usa la temporada', () => {
    const cases = [
      { ev: 'plan', opt: 'party', needs: (c: Career) => c.age <= 28 },
      { ev: 'plan', opt: 'train', needs: (c: Career) => c.age <= 28 },
      { ev: 'mentor', opt: 'yes', needs: () => true },
      { ev: 'derby', opt: 'play', needs: () => true },
      { ev: 'coach', opt: 'talk', needs: () => true },
      { ev: 'coach', opt: 'press', needs: () => true },
      { ev: 'comeback', opt: 'doc', needs: () => true },
    ];
    for (const k of cases) {
      const c = find(x => x.phase === 'decide' && x.queue.length === 1 && x.queue[0].id === k.ev && k.needs(x), 1500, randomPicker);
      const o = c.queue[0].options.find(x => x.id === k.opt)!, g = o.fx.gamble!;
      expect(g, k.ev + '/' + k.opt).toBeDefined();
      const reps = 1600;
      let ok = 0;
      for (let i = 0; i < reps; i++) {
        const n = finishSeason({ ...JSON.parse(JSON.stringify(c)) as Career, rng: seedState(i * 104729 + 7) }, k.opt);
        const said = n.history[n.history.length - 1].lines.join(' | ');
        const good = g.okText ? said.includes(g.okText) : !said.includes(g.badText);
        if (good) ok++;
      }
      expect(Math.abs(ok / reps - g.p), `${k.ev}/${k.opt} dice ${g.p}`).toBeLessThan(0.04);
      // y el texto de la etiqueta lleva ese mismo porcentaje
      const chips = optionChips(c, o).map(x => x.text).join(' | ');
      const pctText = (p: number) => `${Math.round(p * 100)} %`;
      expect(chips.includes(pctText(g.p)) || chips.includes(pctText(1 - g.p)), `${k.ev}/${k.opt}: ${chips}`).toBe(true);
    }
  });
  it('cada opción de cada decisión muestra sus efectos: con números, riesgo con su probabilidad y las mudanzas con sueldo, vidriera y oferta', () => {
    const seen: Record<string, number> = {};
    for (const seed of seeds(150, 5113)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'tactico', nat: ['ar', 'ar', 'br', 'es'][seed % 4] });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide') for (const o of c.queue[0].options) {
          const chips = optionChips(c, o);
          for (const x of chips) { expect(x.text).not.toMatch(/undefined|NaN|Infinity/); seen[x.id] = (seen[x.id] ?? 0) + 1; }
          if (o.fx.gamble) expect(chips.some(x => /\d+ %/.test(x.text)), c.queue[0].id + '/' + o.id).toBe(true);
          if (o.fx.move?.kind === 'transfer' && c.club.lg !== 'inf') expect(chips.some(x => x.id === 'fee' && /Ofrecen €/.test(x.text))).toBe(true);
          if (o.fx.growth && Math.abs(o.fx.growth) >= 0.5 && !o.fx.move) expect(chips.some(x => x.id === 'ovr'), c.queue[0].id + '/' + o.id).toBe(true);
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    for (const id of ['ovr', 'min', 'inj', 'okp', 'badp', 'pay', 'vis', 'fee', 'team']) expect(seen[id] ?? 0, id).toBeGreaterThan(0);
  });
});

describe('momentos clave: la final', () => {
  const withTension = () => find(x => !!x.tension, 3000, smart, { nat: 'ar' });
  it('de vez en cuando tu equipo llega a una final y se define con una decisión: tres opciones, con la chance de ganar que muestran', () => {
    const c = withTension();
    expect(c.phase).toBe('decide');
    expect(c.queue).toHaveLength(1);
    const ev = c.queue[0];
    expect(ev.id).toBe('final');
    expect(ev.options.map(o => o.id)).toEqual(['calm', 'all', 'pen']);
    const t = c.tension!;
    expect(['cont', 'cup']).toContain(t.kind);
    expect(t.p).toBeGreaterThan(0); expect(t.p).toBeLessThan(1);
    for (const o of ev.options) {
      const odds = finalOdds(c, o.fx)!;
      const chips = optionChips(c, o);
      expect(chips.some(x => x.id === 'final' && x.text.includes('Ganar la final')), o.id).toBe(true);
      expect(Math.abs(odds - t.p) < 0.5).toBe(true);
    }
    expect(optionChips(c, ev.options[0]).find(x => x.id === 'final')!.text).toBe(`Ganar la final: ${Math.round(finalOdds(c, ev.options[0].fx)! * 100)} %`);
    expect(finalOdds(c, ev.options[1].fx)!).toBeGreaterThan(t.p);   // ir con todo suma
    expect(optionChips(c, ev.options[1]).some(x => x.id === 'ovr' && /−0,4|-0,4/.test(x.text))).toBe(true); // y cuesta OVR
    expect(optionChips(c, ev.options[2]).some(x => /Lo metés 55 %/.test(x.text))).toBe(true);
    expect(finalOdds(newCareer({ seed: 1, name: 'x', pos: 'DEL', style: 'potrero' }), ev.options[0].fx)).toBeNull();
  });
  it('mientras se decide no se puede colgar los botines, se guarda y se retoma, y la temporada espera su final', () => {
    const c = withTension();
    expect(JSON.stringify(c)).toContain('tension');
    expect(parseCareer(JSON.stringify(c))).toEqual(c);
    expect(canRetireNow(c)).toBe(false);
    const h = c.history[c.history.length - 1];
    const before = h.trophies.length;
    expect(h.lines.join(' ')).not.toMatch(/ganaste la final|perdiste la final/i);
    for (const bad of [{ ...c, tension: { ...c.tension, p: NaN } }, { ...c, tension: { ...c.tension, lg: 'xx' } }, { ...c, phase: 'result' }]) expect(parseCareer(bad)).toBeNull();
    const n = choose(c, 'calm');
    expect(n.phase).toBe('result'); expect(n.tension).toBeNull(); expect(n.queue).toEqual([]);
    const h2 = n.history[n.history.length - 1];
    expect(h2.lines.join(' ')).toMatch(/¡Ganaste la|Perdiste la final|perdió la final|ganó la final/);
    const won = h2.trophies.length > before;
    expect(won).toBe(/¡Ganaste la|ganó la final/.test(h2.lines.join(' ')) && h2.pj >= 8);
  });
  it('la chance que muestra cada opción es la de verdad: la final se gana con esa frecuencia', () => {
    const c = withTension();
    const t = c.tension!;
    for (const o of c.queue[0].options) {
      const shown = finalOdds(c, o.fx)!, reps = 1500;
      let wins = 0;
      for (let i = 0; i < reps; i++) {
        const n = choose({ ...JSON.parse(JSON.stringify(c)) as Career, rng: seedState(i * 31337 + 5) }, o.id);
        const said = n.history[n.history.length - 1].lines.join(' ');
        if (/¡Ganaste la|ganó la final/.test(said)) wins++;
      }
      expect(Math.abs(wins / reps - shown), `${t.name} ${o.id}: se muestra ${shown.toFixed(3)}`).toBeLessThan(0.045);
    }
  });
  it('en las carreras enteras pasa seguido pero no siempre, y nunca rompe el estado', () => {
    let seasons = 0, finals = 0;
    for (const seed of seeds(120, 2111)) {
      const c = simulateRun(seed, { pick: randomPicker, nat: 'ar' });
      expect(c.tension ?? null).toBeNull();
      seasons += c.history.length;
      finals += c.history.filter(h => h.lines.some(l => /final de la/.test(l))).length;
    }
    expect(finals / seasons).toBeGreaterThan(0.005); expect(finals / seasons).toBeLessThan(0.1);
  });
});
const canRetireNow = (c: Career) => c.phase === 'decide' && !c.tension && c.age >= 32 && c.history.length > 0;

describe('Desafío del día', () => {
  it('el día es el de la Argentina (UTC-3): a las 23:30 de allá todavía es el día anterior en UTC', () => {
    expect(argDay(new Date('2026-11-13T02:59:59Z'))).toBe('2026-11-12');
    expect(argDay(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13');
    expect(argDay(new Date('2026-11-12T00:00:00Z'))).toBe('2026-11-11'); // 21:00 del 11 allá
    expect(argDay(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31'); // el año también cambia a las 00:00 argentinas
    expect(argDay(new Date('2028-03-01T02:00:00Z'))).toBe('2028-02-29');
    expect(isDay('2026-11-12')).toBe(true); for (const x of ['2026-13-01', '2026-02-30', '12/11/2026', '', 5, null]) expect(isDay(x)).toBe(false);
  });
  it('la misma fecha da siempre la misma semilla y el mismo arranque; otra fecha, otra', () => {
    expect(dailySeed('2026-11-12')).toBe(dailySeed('2026-11-12'));
    expect(new Set(Array.from({ length: 60 }, (_, i) => dailySeed(`2026-11-${String(1 + (i % 28)).padStart(2, '0')}-${i}`.slice(0, 10)))).size).toBeGreaterThan(20);
    expect(dailySeed('2026-11-12')).not.toBe(dailySeed('2026-11-13'));
    expect(dailySetup('2026-11-12')).toEqual(dailySetup('2026-11-12'));
    expect(dailySetup('2026-11-12').seed).toBe(dailySeed('2026-11-12'));
    // Entre dos instantes del mismo día de la Argentina, el desafío es el mismo
    expect(dailySetup(argDay(new Date('2026-11-12T10:00:00Z')))).toEqual(dailySetup(argDay(new Date('2026-11-13T02:00:00Z'))));
    const setups = Array.from({ length: 120 }, (_, i) => dailySetup(argDay(new Date(Date.UTC(2026, 0, 1 + i, 12)))));
    for (const s of setups) {
      expect(NATIONS.some(n => n.id === s.nat && n.lg)).toBe(true); expect(DPOS_LIST).toContain(s.dpos); expect(['der', 'izq', 'amb']).toContain(s.foot); expect(['normal', 'intenso', 'experto']).toContain(s.diff);
      expect(s.year).toBe(Number(s.day.slice(0, 4)));
    }
    expect(setups.filter(s => s.nat === 'ar').length / 120).toBeGreaterThan(0.4);
    expect(new Set(setups.map(s => s.diff)).size).toBe(3);
  });
  it('la carrera del desafío es la misma para todos (mismo arranque y mismas decisiones = misma carrera), sin importar tu nombre', () => {
    const S = dailySetup('2026-11-12');
    const mk = (name: string, surname: string, num: number) => newCareer({ seed: S.seed, name, surname, num, dpos: S.dpos, pos: 'MED', nat: S.nat, foot: S.foot, diff: S.diff, style: S.style, year: S.year, daily: '2026-11-12', aid: 1 });
    const a = mk('Ana', 'GÓMEZ', 7), b = mk('Beto', 'RUIZ', 99);
    expect(a.daily).toBe('2026-11-12'); expect(a.stats).toEqual(b.stats); expect(a.home).toBe(b.home); expect(a.potential).toBe(b.potential);
    expect(JSON.stringify(a.queue)).toBe(JSON.stringify(b.queue));
    expect(parseCareer(JSON.stringify(a))).toEqual(a);
    expect(parseCareer({ ...a, daily: '12/11/2026' })).toBeNull();
    const run = (c: Career) => { let k = c; const pr = new Rng(seedState(5)); for (let g = 0; g < 400 && k.phase !== 'over'; g++) k = k.phase === 'result' ? advance(k) : choose(k, smart(k, k.queue[0], pr)); return k; };
    expect(run(a).history).toEqual(run(b).history);
  });
  it('el texto para compartir el desafío no cuenta la carrera (sin clubes ni títulos)', () => {
    const S = dailySetup('2026-11-12');
    const c = simulateRun(S.seed, { nat: S.nat, dpos: S.dpos, foot: S.foot, diff: S.diff, year: S.year });
    const d = { ...c, daily: '2026-11-12' };
    const txt = dailyShareText(d, 'https://x.test');
    expect(txt).toContain('Desafío del día'); expect(txt).toContain('12/11'); expect(txt).toContain(`${legacy(d).score} pts`); expect(txt).toContain('https://x.test');
    for (const h of d.history) { expect(txt).not.toContain(h.club); for (const t of h.trophies) expect(txt).not.toContain(t); }
    expect(txt).not.toMatch(/undefined|NaN/);
  });
  it('la racha cuenta días seguidos: sumar uno por día, el mismo día dos veces cuenta una, un hueco la reinicia y un desafío viejo no la baja', () => {
    let s = NO_STREAK;
    s = nextStreak(s, '2026-11-10'); expect(s).toEqual({ last: '2026-11-10', n: 1 });
    s = nextStreak(s, '2026-11-11'); expect(s.n).toBe(2);
    s = nextStreak(s, '2026-11-11'); expect(s.n).toBe(2);        // el mismo día
    s = nextStreak(s, '2026-11-12'); expect(s.n).toBe(3);
    s = nextStreak(s, '2026-11-10'); expect(s).toEqual({ last: '2026-11-12', n: 3 }); // uno viejo no cambia nada
    s = nextStreak(s, '2026-11-14'); expect(s).toEqual({ last: '2026-11-14', n: 1 }); // faltó el 13: de nuevo en 1
    s = nextStreak(s, '2026-11-15'); expect(s.n).toBe(2);
    expect(nextStreak(s, 'no es un día')).toBe(s);
    // cruces de mes y de año, y 29 de febrero
    expect(dayBefore('2026-03-01')).toBe('2026-02-28'); expect(dayBefore('2028-03-01')).toBe('2028-02-29'); expect(dayBefore('2027-01-01')).toBe('2026-12-31');
    let t = nextStreak(nextStreak(NO_STREAK, '2026-12-31'), '2027-01-01'); expect(t.n).toBe(2);
    t = nextStreak(nextStreak(NO_STREAK, '2028-02-29'), '2028-03-01'); expect(t.n).toBe(2);
  });
  it('la racha que se muestra sigue viva hoy y mañana (si jugás), y se apaga si pasó un día entero sin jugar', () => {
    const s = { last: '2026-11-10', n: 4 };
    expect(streakShown(s, '2026-11-10')).toBe(4); expect(streakShown(s, '2026-11-11')).toBe(4); expect(streakShown(s, '2026-11-12')).toBe(0);
    expect(streakShown(NO_STREAK, '2026-11-12')).toBe(0); expect(streakShown({ last: 'x', n: 3 }, '2026-11-12')).toBe(0);
  });
  it('terminar un desafío guarda tu mejor puntaje del día y suma a la racha; repetirlo cuenta aparte y solo mejora si superás tu marca', () => {
    const S = dailySetup('2026-11-12');
    const mk = (aid: number, pick: Picker) => {
      let c = newCareer({ seed: S.seed, name: 'x', pos: 'MED', dpos: S.dpos, nat: S.nat, foot: S.foot, diff: S.diff, style: S.style, year: S.year, daily: '2026-11-12', aid });
      const pr = new Rng(seedState(aid));
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) c = c.phase === 'result' ? advance(c) : choose(c, pick(c, c.queue[0], pr));
      return c;
    };
    const a = mk(11, smart), b = mk(12, bad);
    expect(attemptKey(a)).toBe(11); expect(attemptKey(b)).toBe(12);
    let st = recordStart(emptyAch(), attemptKey(a), '2026-11-12').stats;
    let r = recordFinish(st, a); st = r.stats;
    expect(st.dailyDone).toBe(1); expect(st.dailyBest).toEqual({ day: '2026-11-12', score: legacy(a).score });
    expect(st.streak).toEqual({ last: '2026-11-12', n: 1 }); expect(st.maxStreak).toBe(1);
    expect(r.newly).toContain('daily1');
    r = recordFinish(st, a); expect(r.stats).toBe(st);            // el mismo intento no cuenta dos veces
    const best = Math.max(legacy(a).score, legacy(b).score);
    st = recordFinish(st, b).stats;
    expect(st.dailyDone).toBe(2); expect(st.dailyBest!.score).toBe(best); expect(st.streak.n).toBe(1);
    // al día siguiente, otro desafío: racha de 2 y logro de 3 días cuando llega el tercero
    const next = (day: string, aid: number): Career => ({ ...a, daily: day, aid });
    st = recordFinish(st, next('2026-11-13', 21)).stats; expect(st.streak.n).toBe(2);
    const r3 = recordFinish(st, next('2026-11-14', 22)); expect(r3.stats.streak.n).toBe(3); expect(r3.newly).toContain('streak3');
    expect(r3.stats.dailyBest).toEqual({ day: '2026-11-14', score: legacy(a).score }); // el mejor es del día más nuevo
  });
});

describe('logros', () => {
  it('son 24, con nombre, descripción y nivel; los ids no se repiten y el total coincide con el que usa Inicio', () => {
    expect(ACHIEVEMENTS).toHaveLength(24); expect(ACH_TOTAL).toBe(24); expect(ACH_TOTAL_MODULE).toBe(SUMMARY_TOTAL); expect(ACH_IDS.size).toBe(24);
    for (const a of ACHIEVEMENTS) { expect(a.title.length).toBeGreaterThan(3); expect(a.desc.length).toBeGreaterThan(10); expect(['bronce', 'plata', 'oro', 'leyenda']).toContain(a.tier); expect(a.icon.length).toBeGreaterThan(0); expect(a.target).toBeGreaterThan(0); }
    expect(new Set(ACHIEVEMENTS.map(a => a.title)).size).toBe(24);
    for (const id of ['start1', 'start5', 'start10', 'start25', 'start50', 'start100', 'fin1', 'fin5', 'fin10', 'fin25', 'seas50', 'seas200', 'seas500', 'tit10', 'tit50', 'day3', 'exp', 'ovr90', 'daily1', 'streak3', 'streak7', 'rec5']) expect(ACH_IDS.has(id), id).toBe(true);
  });
  it('el avance se calcula sin pasarse de la meta, y evaluate devuelve solo lo nuevo', () => {
    expect(progress(3, 10)).toEqual({ value: 3, target: 10, pct: 30 }); expect(progress(30, 10).pct).toBe(100); expect(progress(-2, 10).pct).toBe(0); expect(progress(NaN, 10).value).toBe(0); expect(progress(1, 0).target).toBe(1);
    const s = { ...emptyAch(), careersStarted: 5 };
    expect(evaluate(s)).toEqual(['start1', 'start5']);
    const both = withUnlocked(s, ['start1'], '2026-11-12T10:00:00Z');
    expect(evaluate({ ...both, careersStarted: 10 }, both)).toEqual(['start5', 'start10']);
    expect(unlockedCount(both)).toBe(1);
    expect(withUnlocked(both, ['zzz'], 'x')).toBe(both);
  });
  it('arrancar una carrera se cuenta una sola vez por carrera (aunque se recargue o se toque dos veces) y detecta tres en un día', () => {
    let st = emptyAch();
    let r = recordStart(st, 1001, '2026-11-12'); st = r.stats;
    expect(st.careersStarted).toBe(1); expect(r.newly).toEqual(['start1']);
    r = recordStart(st, 1001, '2026-11-12'); expect(r.stats).toBe(st); expect(r.newly).toEqual([]);
    st = recordStart(st, 1002, '2026-11-12').stats;
    r = recordStart(st, 1003, '2026-11-12'); expect(r.newly).toContain('day3'); expect(r.stats.maxPerDay).toBe(3);
    r = recordStart(r.stats, 1004, '2026-11-13'); expect(r.stats.dayCount).toBe(1); expect(r.stats.maxPerDay).toBe(3);
    for (let i = 0; i < 300; i++) st = recordStart(st, 5000 + i, '2026-12-01').stats;
    expect(st.started.length).toBeLessThanOrEqual(200);
    expect(unlockedCount(st)).toBeGreaterThanOrEqual(6);
    expect(st.unlocked.start100).toBeDefined();
  });
  it('terminar una carrera suma temporadas, títulos y mejor OVR una sola vez, y marca lo especial (Experto, retiro con 90, campeón del mundo, la cima)', () => {
    const c = simulateRun(555, { diff: 'experto', pick: smart });
    const t = totals(c);
    let r = recordFinish(emptyAch(), c);
    expect(r.stats.careersFinished).toBe(1); expect(r.stats.seasonsPlayed).toBe(t.seasons); expect(r.stats.titlesWon).toBe(t.trophies); expect(r.stats.bestOvr).toBe(t.peak);
    expect(r.stats.flags).toContain('exp'); expect(r.newly).toEqual(expect.arrayContaining(['fin1', 'exp']));
    expect(recordFinish(r.stats, c).stats).toBe(r.stats);
    expect(recordFinish(emptyAch(), { ...c, phase: 'decide' }).stats.careersFinished).toBe(0); // una carrera sin terminar no cuenta
    const star = { ...c, diff: 'normal' as const, stats: { rit: 95, tir: 95, pas: 95, reg: 95, def: 95, fis: 95 } };
    expect(recordFinish(emptyAch(), star).stats.flags).toContain('ovr90');
    const wc = { ...c, history: c.history.map((h, i) => (i === 0 ? { ...h, trophies: [...h.trophies, 'Mundial'] } : h)) };
    expect(recordFinish(emptyAch(), wc).stats.flags).toContain('wc');
    // se acumula en varias carreras
    const c2 = simulateRun(556);
    const s2 = recordFinish(recordFinish(emptyAch(), c).stats, c2).stats;
    expect(s2.careersFinished).toBe(2); expect(s2.seasonsPlayed).toBe(t.seasons + totals(c2).seasons);
  });
  it('lo guardado se lee con cualquier basura sin romper, y cada perfil tiene lo suyo', () => {
    const c = simulateRun(7);
    const st = recordFinish(recordStart(emptyAch(), 7, '2026-11-12').stats, c).stats;
    expect(parseAch(JSON.stringify(st))).toEqual(st);
    for (const junk of [null, undefined, 5, 'x', '{', '[]', {}, { v: 1 }, { v: 2, careersStarted: -5, started: 'x', unlocked: { zzz: 'x', start1: 5 }, rec: null, streak: { last: 'mañana', n: 4 }, dailyBest: { day: 'x', score: 'y' } }]) {
      const p = parseAch(junk as unknown);
      expect(p.v).toBe(2); expect(p.careersStarted).toBeGreaterThanOrEqual(0); expect(Object.keys(p.unlocked).every(k => ACH_IDS.has(k))).toBe(true);
      expect(p.streak.n === 0 || isDay(p.streak.last)).toBe(true); expect(Array.isArray(p.started) && Array.isArray(p.flags)).toBe(true);
    }
  });
});

describe('récords personales', () => {
  it('solo se rompe un récord que ya existía y se supera de verdad (la primera carrera fija la vara)', () => {
    const rec = { ovr: 80, titles: 3, goals: 0, val: 5_000_000, score: 200 };
    expect(brokenRecords(rec, { ovr: 81, titles: 3, goals: 10, val: 4_000_000, score: 150 })).toEqual(['ovr']);   // empatar no rompe, y los que valen 0 no se rompen
    expect(brokenRecords(rec, { ovr: 80, titles: 4, goals: 99, val: 9_000_000, score: 201 })).toEqual(['titles', 'val', 'score']);
    expect(brokenRecords(emptyAch().rec, { ovr: 90, titles: 9, goals: 9, val: 9, score: 9 })).toEqual([]);
  });
  it('terminar una carrera actualiza los récords, guarda cuáles rompió y cuánto valían antes, y suma al logro de Rompe-récords', () => {
    const a = simulateRun(63, { pick: smart }), b = simulateRun(62, { pick: smart, diff: 'normal' });
    let st = recordFinish(emptyAch(), a).stats;
    expect(st.rec).toEqual(recordsOf(a)); expect(st.lastRec).toEqual({ seed: 63, ks: [], old: {} }); expect(st.recBeaten).toBe(0);
    const better = { ...b, seed: 99, stats: { ...b.stats }, history: b.history.map(h => ({ ...h, trophies: [...h.trophies, 'Champions League'], goals: h.goals + 20, val: h.val * 4 })) };
    const r = recordFinish(st, better);
    expect(r.broken).toEqual(expect.arrayContaining(['titles', 'goals', 'val']));
    expect(r.stats.lastRec!.seed).toBe(99);
    for (const k of r.broken) expect(r.stats.lastRec!.old[k]).toBe(st.rec[k]);
    expect(r.stats.recBeaten).toBe(r.broken.length);
    for (const k of REC_KEYS) expect(r.stats.rec[k]).toBeGreaterThanOrEqual(st.rec[k]);
    // un resultado peor no baja nada
    const worse = recordFinish(r.stats, { ...a, seed: 100, history: a.history.slice(0, 3) });
    for (const k of REC_KEYS) expect(worse.stats.rec[k]).toBe(r.stats.rec[k]);
    let s5 = emptyAch(); s5 = { ...s5, rec: recordsOf(a), recBeaten: 4 };
    expect(recordFinish(s5, { ...better, seed: 123 }).newly).toContain('rec5');
  });
});

describe('desbloqueables', () => {
  it('cada uno sale de un logro que existe; se usa lo mejor que tengas de cada tipo y avisa qué se desbloqueó', () => {
    for (const c of COSMETICS) { expect(ACH_IDS.has(c.ach), c.id).toBe(true); expect(c.label.length).toBeGreaterThan(5); expect(c.color).toMatch(/^#[0-9a-f]{6}$/i); }
    expect(activeCosmetics({})).toEqual({ trim: null, boots: null, frame: null, frameId: null });
    const a = activeCosmetics({ fin1: 'x', start5: 'x', fin5: 'x', tit10: 'x' });
    expect(a.boots).toBe('#f2f4f6'); expect(a.trim).toBe('#f4bd2c'); expect(a.frameId).toBe('frame-plata');
    expect(activeCosmetics({ wc: 'x', fin1: 'x' }).boots).toBe('#f4bd2c');
    expect(unlockedBy('wc').map(c => c.label)).toEqual(['botines dorados']);
    expect(unlockedBy('start1')).toEqual([]);
  });
});

describe('escudos y logos', () => {
  it('cada club tiene su id de escudo de ESPN o figura en la lista de "sin escudo"; los ids son números y no hay clubes de más', () => {
    const missing = CLUBS.filter(c => !CLUB_ESPN[c.name]).map(c => c.name);
    expect([...missing].sort()).toEqual([...SIN_ESCUDO].sort());
    expect(SIN_ESCUDO.length).toBeLessThanOrEqual(3);
    for (const n of SIN_ESCUDO) expect(CLUB_BY_NAME.has(n), n).toBe(true);
    for (const [name, [id, color]] of Object.entries(CLUB_ESPN)) {
      expect(CLUB_BY_NAME.has(name), name).toBe(true);
      expect(id).toMatch(/^\d{1,8}$/); expect(color === '' || /^[0-9a-f]{6}$/.test(color)).toBe(true);
    }
    expect(Object.keys(CLUB_ESPN).length).toBeGreaterThan(CLUBS.length - 4);
    for (const n of ['Boca Juniors', 'River Plate', 'Real Madrid', 'Flamengo', 'Beşiktaş']) expect(CLUB_ESPN[n], n).toBeDefined();
  });
  it('las ligas, copas y torneos tienen su logo (menos los que no tienen) y no hay ids repetidos entre competencias distintas', () => {
    const names = [...LEAGUE_IDS.filter(i => i !== 'inf').map(i => LEAGUES[i].name), ...CONT_IDS.map(i => CONTS[i].name), 'Mundial', 'Juegos Olímpicos', 'Mundial de Clubes', ...NAT_CUP_LIST.map(t => t.name),
      ...LEAGUE_IDS.flatMap(i => (LEAGUES[i].cup ? [LEAGUES[i].cup!] : []))];
    const noLogo = names.filter(n => !COMP_LOGO[n]);
    expect(noLogo.sort()).toEqual(['Copa de Turquía', 'Taça de Portugal']);
    for (const id of Object.values(COMP_LOGO)) expect(id).toMatch(/^\d{1,6}$/);
  });
  it('el aviso legal está en una sola constante, con el texto exacto', () => {
    expect(LEGAL_NOTICE).toBe('Los nombres, escudos y logos de clubes, selecciones, ligas y competencias se usan solo para identificarlos dentro de esta simulación y pertenecen a sus titulares. El Partidito no está afiliado, patrocinado ni avalado por ninguno de ellos. Todo lo que pasa en el juego es ficticio.');
  });
});

describe('arreglos de la revisión', () => {
  it('las cesiones son para jugar: casi nunca te ofrecen un club donde arrancás en el banco', () => {
    let offers = 0, bench = 0;
    for (const seed of seeds(500, 211)) {
      const pr = new Rng(seedState(seed));
      let c = newCareer({ seed, name: 'x', pos: POS[seed % 4], style: 'potrero', nat: ['ar', 'ar', 'br', 'es', 'uy'][seed % 5] });
      for (let g = 0; g < 400 && c.phase !== 'over'; g++) {
        if (c.phase === 'decide' && c.queue[0].id === 'loan') {
          const o = c.queue[0].options.find(x => x.id === 'loan')!;
          offers++; if (o.hint.includes('Arrancarías en el banco')) bench++;
          const lend = o.fx.move!.club;
          expect(lend.pw).toBeLessThanOrEqual(c.club.pw);
        }
        c = c.phase === 'result' ? advance(c) : choose(c, randomPicker(c, c.queue[0], pr));
      }
    }
    expect(offers).toBeGreaterThan(40);
    expect(bench / offers).toBeLessThan(0.03);
  });
  it('el tope de partidos es una cota verdadera: también para ligas con copas de ida y vuelta sin grupos (Concachampions)', () => {
    expect(gamesCap('mx')).toBeGreaterThanOrEqual(LEAGUES.mx.games + 2 * (CONTS.ccc.rounds.length - 1) + 1);
    for (const lg of LEAGUE_IDS) expect(gamesCap(lg)).toBeGreaterThan(LEAGUES[lg].games);
    let seen = 0;
    for (const nat of ['mx', 'us', 'br', 'ar', 'es']) for (const seed of seeds(60, 6551)) {
      const c = simulateRun(seed, { nat, pick: smart, year: 2026 + (seed % 4) });
      for (const h of c.history) { expect(h.pj).toBeLessThanOrEqual(gamesCap(h.lg)); if (h.trophies.includes('Concachampions')) seen++; }
    }
    expect(seen).toBeGreaterThanOrEqual(0);
  });
  it('singular y plural: "1 partido", "1 gol", "1 asistencia", "1 valla invicta"', () => {
    expect(pl(1, 'partido', 'partidos')).toBe('1 partido'); expect(pl(0, 'gol', 'goles')).toBe('0 goles'); expect(pl(2, 'valla invicta', 'vallas invictas')).toBe('2 vallas invictas');
    const c = simulateRun(1, { pick: smart });
    const one = { ...c, history: [{ ...c.history[0], pj: 1, goals: 1, assists: 1, cs: 1, caps: 1, capGoals: 1, capAssists: 1, trophies: ['Copa Argentina'], awards: [] }], club: c.club };
    one.history[0].club = c.history[0].club;
    const txt = shareText({ ...one, pos: 'DEF' } as Career, 'x');
    expect(txt).toMatch(/1 partido\b/); expect(txt).toMatch(/1 valla invicta/); expect(txt).toMatch(/1 título/); expect(txt).not.toMatch(/\b1 (partidos|goles|asistencias|títulos|temporadas)/);
    expect(shareText({ ...one, pos: 'DEL' } as Career, 'x')).toMatch(/1 gol · 🅰️ 1 asistencia\b/);
    for (const seed of seeds(80, 3)) for (const h of simulateRun(seed).history) expect(h.lines.join(' ')).not.toMatch(/\b1 (partidos|goles)\b/);
  });
  it('datos reales corregidos: sin Toronto FC, Beşiktaş con ş, la copa de Turquía da la Europa League', () => {
    expect(CLUB_BY_NAME.has('Toronto FC')).toBe(false); expect(CLUB_BY_NAME.has('Besiktas')).toBe(false); expect(CLUB_BY_NAME.has('Beşiktaş')).toBe(true);
    expect(LEAGUES.tr.cupQual).toBe('el');
    for (const c of clubsOf('us')) expect(LEAGUES[c.lg].country).toBe('Estados Unidos');
    expect(LEAGUES.ar1.n).toBe(32); expect(clubsOf('ar1')).toHaveLength(32);
  });
  it('la liga siempre tiene el tamaño que dice, también con un club recién ascendido o descendido', () => {
    const r = new Rng(seedState(11));
    for (const lg of ['ar1', 'ar2', 'en', 'us'] as const) {
      const n = sizeOf(lg), seen = new Set<number>();
      for (const pw of [40, 55, 60, 65, 70, 80, 95]) {
        const club = { name: clubsOf(lg)[0].name, tier: 2 as const, pw, lg };
        for (let i = 0; i < 400; i++) { const k = finishRank(club, 0, r); expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(n); seen.add(k); }
      }
      expect(Math.max(...seen)).toBe(n); // el último puesto existe
      expect(Math.min(...seen)).toBe(1);
    }
  });
  it('en las inferiores no hay Premio Puskás, y los años en las inferiores no cuentan para el bonus de lealtad', () => {
    for (const seed of seeds(300, 9)) for (const h of simulateRun(seed).history) if (h.lg === 'inf') expect(h.awards).not.toContain('Premio Puskás');
    const c = simulateRun(14);
    const youth = { ...c, history: Array.from({ length: 9 }, (_, i) => ({ ...c.history[0], n: i + 1, club: c.home, lg: 'inf' as const, tier: 0 as const, trophies: [], awards: [], goals: 0, assists: 0, cs: 0, pj: 0, caps: 0, capGoals: 0, capAssists: 0, ovr0: 50, ovr: 50 })), returned: false };
    const pro = { ...youth, history: youth.history.map(h => ({ ...h, lg: 'ar1' as const, tier: 2 as const })) };
    expect(legacyBase(pro as Career) - legacyBase(youth as Career)).toBeGreaterThanOrEqual(10); // en primera, 9 años seguidos sí dan +10
  });
  it('si cambia de puesto en la cancha y la posición, la nueva posición queda en el mismo puesto', () => {
    for (const d of DPOS_LIST) for (const p of POS) if (DPOS_POS[d] !== p) expect(DPOS_POS[dposFor(d, p)]).toBe(p);
  });
});

describe('carrera argentina: balance (Normal, Intenso, Experto)', () => {
  it('llegar a Europa: cerca de la mitad en Normal, alrededor de un tercio en Intenso y poco en Experto; y se gana algún título argentino', () => {
    const N = 300;
    const AR_TITLES = new Set(['Liga Profesional', 'Primera Nacional', 'Copa Argentina', 'Copa de la Liga', 'Trofeo de Campeones', 'Copa Libertadores', 'Copa Sudamericana', 'Recopa Sudamericana']);
    const out: Record<string, { eu: number; ar: number; first: Record<string, number> }> = {};
    for (const d of ['normal', 'intenso', 'experto'] as Difficulty[]) {
      let eu = 0, ar = 0; const first: Record<string, number> = {};
      for (const s of seeds(N, 104729)) {
        const c = simulateRun(s, { diff: d, nat: 'ar' });
        const e = c.history.find(h => LEAGUES[h.lg].conf === 'uefa');
        if (e) { eu++; first[e.lg] = (first[e.lg] ?? 0) + 1; }
        if (c.history.some(h => h.trophies.some(t => AR_TITLES.has(t)))) ar++;
      }
      out[d] = { eu: eu / N, ar: ar / N, first };
    }
    expect(out.normal.eu).toBeGreaterThan(0.42); expect(out.normal.eu).toBeLessThan(0.68);
    expect(out.intenso.eu).toBeGreaterThan(0.2); expect(out.intenso.eu).toBeLessThan(0.42);
    expect(out.experto.eu).toBeGreaterThan(0.06); expect(out.experto.eu).toBeLessThan(0.26);
    expect(out.normal.eu).toBeGreaterThan(out.intenso.eu); expect(out.intenso.eu).toBeGreaterThan(out.experto.eu);
    expect(out.normal.ar).toBeGreaterThan(0.2); expect(out.intenso.ar).toBeGreaterThan(0.12); expect(out.experto.ar).toBeGreaterThan(0.08);
    // y la primera escala suele ser Portugal, Italia o España
    const f = out.normal.first, tot = Object.values(f).reduce((t, x) => t + x, 0);
    expect(((f.pt ?? 0) + (f.it ?? 0) + (f.es ?? 0)) / tot).toBeGreaterThan(0.45);
  });
  it('el Mundial Sub-20, la Copa de la Liga, el Trofeo de Campeones y la Recopa existen en el calendario argentino', () => {
    const seen: Record<string, number> = {};
    for (const s of seeds(200, 2203)) for (const h of simulateRun(s, { nat: 'ar', pick: smart }).history) { for (const t of h.trophies) seen[t] = (seen[t] ?? 0) + 1; for (const t of h.tours) seen[t.split(' · ')[0]] = (seen[t.split(' · ')[0]] ?? 0) + 1; }
    for (const t of ['Copa de la Liga', 'Mundial Sub-20', 'Mundial', 'Copa América']) expect(seen[t] ?? 0, t).toBeGreaterThan(0);
    expect(isWorldCupYear(2026)).toBe(true);
    expect(seasonYear({ y0: 2026, age: 21 })).toBe(2030);
  });
  it('una carrera tiene las mismas decisiones y el mismo resultado con la misma semilla (determinismo con todo lo nuevo)', () => {
    for (const nat of ['ar', 'es', 'jp']) {
      const a = simulateRun(77, { nat, dpos: 'MCO', foot: 'amb', diff: 'intenso' }), b = simulateRun(77, { nat, dpos: 'MCO', foot: 'amb', diff: 'intenso' });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(parseCareer(JSON.stringify(a))).toEqual(a);
      expect(parseBest(JSON.stringify(bestOf(a)))).toEqual(bestOf(a));
    }
    expect(startOptsOf(simulateRun(77, { nat: 'uy', dpos: 'LI', foot: 'izq', diff: 'experto' }))).toMatchObject({ nat: 'uy', foot: 'izq', diff: 'experto', name: 'Test' });
    expect(pickHome(nationOf('ar'), new Rng(1)).moved).toBe(false);
    expect(drawEvents.length).toBe(2);
    expect(legacyScore(simulateRun(77, { diff: 'normal' }))).toBeGreaterThanOrEqual(0);
    void DPOS_DEFAULT; void FOOTS; void flagUrl; void (null as unknown as EventInst);
  });
});

describe('Jugar otra carrera y pistas de las ofertas (revisión)', () => {
  it('"Jugar otra carrera" arranca con la posición con la que arrancó la carrera, no con la que terminó tras una reconversión', () => {
    const takeSwitch: Picker = (c, ev, r) => (ev.id === 'switch' ? 'yes' : randomPicker(c, ev, r));
    let found: Career | null = null;
    for (const seed of seeds(60, 31)) {
      const c = simulateRun(seed, { dpos: 'LI', pick: takeSwitch });
      if (c.dpos !== 'LI') { found = c; break; }
    }
    expect(found, 'alguna carrera cambia de puesto').not.toBeNull();
    expect(found!.dpos0).toBe('LI');
    expect(found!.dpos).not.toBe('LI');
    expect(startOptsOf(found!).dpos).toBe('LI');
    // la carrera guardada recuerda su posición de arranque
    expect(parseCareer(JSON.stringify(found))!.dpos0).toBe('LI');
  });
  it('una carrera guardada sin posición de arranque (de antes) sigue sirviendo y usa la actual; una posición de arranque rota la descarta', () => {
    const c = simulateRun(77, { dpos: 'MCO' });
    const old = JSON.parse(JSON.stringify(c)); delete old.dpos0;
    expect(parseCareer(old)).not.toBeNull();
    expect(startOptsOf(parseCareer(old)!).dpos).toBe(c.dpos);
    expect(parseCareer({ ...old, dpos0: 'XX' })).toBeNull();
    expect(parseCareer({ ...old, dpos0: 7 })).toBeNull();
  });
  it('las pistas de las ofertas ("Serías titular") salen del mismo OVR que ve el jugador y usa la temporada (con la posición en la cancha)', () => {
    let checked = 0;
    for (const dpos of ['LI', 'DC', 'MCD', 'EI'] as const) {
      for (const seed of seeds(12, 4100)) {
        const spy: Picker = (c, ev, r) => {
          if ((ev.id === 'transfer' || ev.id === 'debut') && c.picks.length === 0) { // la primera decisión de la temporada: la segunda se armó antes de un posible cambio de puesto
            for (const o of ev.options) if (o.fx.move) {
              expect(o.hint, `${dpos} ${seed}`).toContain(expectedRole(careerOvr(c.stats, c.pos, c.dpos) - o.fx.move.club.pw));
              checked++;
            }
          }
          return randomPicker(c, ev, r);
        };
        simulateRun(seed, { dpos, pick: spy });
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('bundle principal: Inicio no trae el simulador ni el diseñador de escudos', () => {
  const importsOf = (src: string) => [...src.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
  it('la entrada al juego solo importa lo mínimo (resumen y fecha), y estos dos no importan nada', () => {
    expect(importsOf(careerEntrySrc).sort()).toEqual(['./careerDaily', './careerSummary', 'preact/hooks']);
    expect(importsOf(careerDailySrc)).toEqual([]);
    expect(importsOf(careerSummarySrc)).toEqual([]);
  });
  it('Inicio importa el escudo diseñado solo por su link (crestUrl), no por crestCore: si no, el diseñador entero viaja en el bundle principal', () => {
    const imps = importsOf(homePageSrc);
    expect(imps.filter(p => p.startsWith('../community/crest'))).toEqual(['../community/crestUrl']);
    expect(imps.some(p => /career(Core|Data|World|Events|Logos|Store)|useCareer|CareerPage/.test(p))).toBe(false);
  });
});
