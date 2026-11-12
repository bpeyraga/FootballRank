import { describe, expect, it } from 'vitest';
import { fitsFormation, formationsFor, lineup, pickFormation, slotsFor, swapSlots, type FP } from './formation';

const p = (id: string, pos: FP['pos'], ovr: number | null, gk: number | null = null): FP => ({ id, pos, ovr, gk });
const ids = (r: ReturnType<typeof lineup<FP>>) => r.placed.map(s => `${s.slot.pos}:${s.p?.id ?? '-'}`);

describe('formaciones', () => {
  it('hay una formación para cada cantidad de jugadores, y suma los de campo', () => {
    for (let n = 1; n <= 20; n++) {
      const opts = formationsFor(n);
      expect(opts.length).toBeGreaterThan(0);
      for (const f of opts) {
        expect(fitsFormation(f, n)).toBe(true);
        expect(slotsFor(f)).toHaveLength(n);
      }
    }
  });
  it('fútbol 5 arranca en rombo 1-2-1 con el arquero en el puesto 0', () => {
    expect(formationsFor(5)[0]).toBe('1-2-1');
    expect(slotsFor('1-2-1').map(s => s.pos)).toEqual(['ARQ', 'DEF', 'MED', 'MED', 'DEL']);
  });
  it('con muchos jugadores ninguna línea pasa de 5', () => {
    for (const f of formationsFor(20)) expect(Math.max(...f.split('-').map(Number))).toBeLessThanOrEqual(5);
  });
  it('si la formación guardada ya no sirve (cambió la cantidad), usa la de siempre', () => {
    expect(pickFormation('2-2', 5)).toBe('2-2');
    expect(pickFormation('2-2', 6)).toBe(formationsFor(6)[0]);
    expect(pickFormation(null, 7)).toBe(formationsFor(7)[0]);
    expect(fitsFormation('0-4', 5)).toBe(false);
  });
});

describe('lineup', () => {
  it('pone a todos en la cancha (sin suplentes) aunque sean más de 5', () => {
    const ps = Array.from({ length: 8 }, (_, i) => p('x' + i, i === 0 ? 'ARQ' : 'MED', 50 + i));
    const r = lineup(ps, slotsFor(formationsFor(8)[0]));
    expect(r.bench).toEqual([]);
    expect(r.placed.every(s => s.p)).toBe(true);
    expect(r.placed[0].p?.id).toBe('x0');
  });
  it('pone al mejor de cada posición', () => {
    const r = lineup([p('d2', 'DEL', 80), p('m1', 'MED', 60), p('m2', 'MED', 65), p('f1', 'DEF', 55), p('a1', 'ARQ', 50)], slotsFor('1-2-1'));
    expect(ids(r)).toEqual(['ARQ:a1', 'DEF:f1', 'MED:m2', 'MED:m1', 'DEL:d2']);
  });
  it('sin arquero de posición, ataja el que mejor ataja', () => {
    const r = lineup([p('d1', 'DEL', 70, 80), p('m1', 'MED', 60), p('m2', 'MED', 65), p('f1', 'DEF', 55, 30), p('f2', 'DEF', 50)], slotsFor('1-2-1'));
    expect(r.placed[0].p?.id).toBe('d1');
  });
  it('sin nadie calificado atajando, va al arco el de posición más cercana', () => {
    const r = lineup([p('d1', 'DEL', 70), p('m1', 'MED', 60), p('f1', 'DEF', 55)], slotsFor('1-1'));
    expect(r.placed[0].p?.id).toBe('f1');
  });
  it('entre dos arqueros, el que mejor ataja', () => {
    const r = lineup([p('a1', 'ARQ', 80, 40), p('a2', 'ARQ', 50, 85), p('m', 'MED', 60)], slotsFor('1-1'));
    expect(r.placed[0].p?.id).toBe('a2');
  });
  it('respeta los puestos guardados y ubica solo al resto', () => {
    const ps = [p('a1', 'ARQ', 50), p('d1', 'DEL', 80), p('m1', 'MED', 60), p('f1', 'DEF', 55), p('m2', 'MED', 65)];
    const r = lineup(ps, slotsFor('1-2-1'), new Map([['d1', 0], ['a1', 4], ['m1', 99]]));
    expect(r.placed[0].p?.id).toBe('d1');
    expect(r.placed[4].p?.id).toBe('a1');
    expect(r.bench).toEqual([]);
    expect(r.placed.every(s => s.p)).toBe(true);
  });
  it('para un puesto vacante, entre los igual de cercanos elige al que más rinde ahí', () => {
    // Puesto DEL vacante: dos MED a la misma distancia. m1 tiene más OVR general pero m2 tira mucho mejor.
    const m1 = { ...p('m1', 'MED', 80), stats: { rit: 60, tir: 40, pas: 95, reg: 70, def: 90, fis: 80 } };
    const m2 = { ...p('m2', 'MED', 70), stats: { rit: 80, tir: 90, pas: 60, reg: 80, def: 30, fis: 60 } };
    const m3 = { ...p('m3', 'MED', 90), stats: { rit: 90, tir: 90, pas: 90, reg: 90, def: 90, fis: 90 } };
    const r = lineup([p('a', 'ARQ', 50), p('f', 'DEF', 60), m1, m2, m3], slotsFor('1-2-1'));
    expect(r.placed[4].slot.pos).toBe('DEL');
    expect(r.placed[4].p?.id).toBe('m2');
  });
  it('swapSlots cambia a dos de lugar', () => {
    expect(swapSlots(['a', 'b', 'c'], 0, 2)).toEqual(['c', 'b', 'a']);
  });
});
