// "De potrero a leyenda": balance de las decisiones nuevas (una por temporada, segura o arriesgada). Se juegan miles de carreras con semilla y se mide:
// el pico de OVR, cuántas llegan a Europa, cuántas ganan algún título, el Legado y lo que rinde arriesgar contra cuidarse.
import { describe, expect, it } from 'vitest';
import { legacy, randomPicker, riskyPicker, safePicker, simulateRun, totals, type Picker } from './careerCore';
import { LEAGUES } from './careerWorld';
import type { Difficulty } from './careerTypes';

const seeds = (n: number, k = 104729) => Array.from({ length: n }, (_, i) => (i + 1) * k);
/** Se la juega donde conviene (entrenar de joven, fichar, la Selección, la final) y se cuida el resto. */
const smart: Picker = (c, ev) => {
  switch (ev.id) {
    case 'plan': return c.age <= 28 ? 'risky' : 'safe';
    case 'selec': case 'oly': case 'debut': case 'transfer': case 'abroad': case 'renewal': case 'youth': case 'captain': case 'final': return 'risky';
    case 'home': return c.age >= 34 ? 'risky' : 'safe';
    default: return 'safe';
  }
};
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);
const sd = (x: number[]) => Math.sqrt(mean(x.map(v => (v - mean(x)) ** 2)));
const q = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];

interface Stat { peak: number[]; score: number[]; seasons: number[]; eu: number; title: number; top: number; legend: number; idx: number[] }
const N = 250;
function table(d: Difficulty, pick: Picker): Stat {
  const o: Stat = { peak: [], score: [], seasons: [], eu: 0, title: 0, top: 0, legend: 0, idx: [0, 0, 0, 0, 0, 0] };
  for (const s of seeds(N)) {
    const c = simulateRun(s, { diff: d, nat: 'ar', pick });
    const t = totals(c), l = legacy(c);
    o.peak.push(t.peak); o.score.push(l.score); o.seasons.push(t.seasons); o.idx[l.index]++;
    if (c.history.some(h => LEAGUES[h.lg].conf === 'uefa')) o.eu++;
    if (t.trophies > 0) o.title++;
    if (l.index >= 5) o.top++;
    if (l.index >= 4) o.legend++;
  }
  return o;
}

describe('balance de la carrera argentina con decisiones seguras y arriesgadas', () => {
  const T: Record<string, Stat> = {};
  for (const d of ['normal', 'intenso', 'experto'] as Difficulty[]) for (const [name, p] of [['safe', safePicker], ['risky', riskyPicker], ['random', randomPicker], ['smart', smart]] as const) T[`${d}/${name}`] = table(d, p);

  const pct = (o: Stat, k: 'eu' | 'title' | 'top') => o[k] / N;

  it('Argentina primero: quien solo se cuida nunca sale del país; a Europa se llega arriesgando, y cuesta más en Intenso y Experto', () => {
    for (const d of ['normal', 'intenso', 'experto']) expect(T[d + '/safe'].eu).toBe(0);
    expect(pct(T['normal/random'], 'eu')).toBeGreaterThan(0.4); expect(pct(T['normal/random'], 'eu')).toBeLessThan(0.72);
    expect(pct(T['intenso/random'], 'eu')).toBeGreaterThan(0.2); expect(pct(T['intenso/random'], 'eu')).toBeLessThan(0.45);
    expect(pct(T['experto/random'], 'eu')).toBeGreaterThan(0.05); expect(pct(T['experto/random'], 'eu')).toBeLessThan(0.28);
    expect(pct(T['normal/risky'], 'eu')).toBeGreaterThan(pct(T['intenso/risky'], 'eu'));
    expect(pct(T['intenso/risky'], 'eu')).toBeGreaterThan(pct(T['experto/risky'], 'eu'));
  });
  it('pico de OVR y títulos por dificultad: parejo en Normal, más duro en Intenso y Experto', () => {
    for (const p of ['safe', 'risky', 'random', 'smart']) {
      const n = mean(T['normal/' + p].peak), i = mean(T['intenso/' + p].peak), e = mean(T['experto/' + p].peak);
      expect(n).toBeGreaterThan(68); expect(n).toBeLessThan(77);
      expect(n).toBeGreaterThan(i); expect(i).toBeGreaterThan(e);
      expect(pct(T['normal/' + p], 'title')).toBeGreaterThan(pct(T['experto/' + p], 'title'));
    }
    expect(pct(T['normal/random'], 'title')).toBeGreaterThan(0.6);
    expect(pct(T['experto/random'], 'title')).toBeGreaterThan(0.25); expect(pct(T['experto/random'], 'title')).toBeLessThan(0.6);
    for (const k of Object.keys(T)) { expect(q(T[k].peak, 0.9)).toBeLessThan(92); expect(q(T[k].peak, 0.1)).toBeGreaterThan(52); expect(mean(T[k].seasons)).toBeGreaterThan(15); expect(mean(T[k].seasons)).toBeLessThan(23); }
  });
  it('arriesgar bien rinde: jugarsela donde conviene supera a cuidarse siempre, y la cima (Mejor de la historia) es rara', () => {
    for (const d of ['normal', 'intenso', 'experto']) {
      expect(mean(T[d + '/smart'].score), d).toBeGreaterThan(mean(T[d + '/safe'].score));
      expect(mean(T[d + '/smart'].score), d).toBeGreaterThan(mean(T[d + '/random'].score) - 5);
      // la apuesta ciega tiene mucho más vaivén que cuidarse
      expect(sd(T[d + '/risky'].score), d).toBeGreaterThan(sd(T[d + '/safe'].score));
    }
    for (const k of Object.keys(T)) expect(pct(T[k], 'top'), k).toBeLessThan(0.09);
    expect(pct(T['normal/smart'], 'top')).toBeGreaterThan(pct(T['experto/smart'], 'top') - 0.001);
  });
});
