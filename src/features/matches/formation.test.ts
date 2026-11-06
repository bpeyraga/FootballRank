import { describe, expect, it } from 'vitest';
import { lineup, type FP } from './formation';

const p = (id: string, pos: FP['pos'], ovr: number | null): FP => ({ id, pos, ovr });
const ids = (r: ReturnType<typeof lineup<FP>>) => r.placed.map(s => `${s.slot.pos}:${s.p?.id ?? '-'}`);

describe('lineup (fútbol 5, 1-2-1)', () => {
  it('pone al mejor de cada posición y deja el resto como alternativas/suplentes', () => {
    const r = lineup([p('d1', 'DEL', 70), p('d2', 'DEL', 80), p('m1', 'MED', 60), p('m2', 'MED', 65),
      p('f1', 'DEF', 55), p('a1', 'ARQ', 50)]);
    expect(ids(r)).toEqual(['DEL:d2', 'MED:m2', 'MED:m1', 'DEF:f1', 'ARQ:a1']);
    expect(r.placed[0].alts.map(x => x.id)).toEqual(['d1']);
    expect(r.bench.map(x => x.id)).toEqual(['d1']);
  });
  it('sin arquero, completa con el de posición más cercana', () => {
    const r = lineup([p('d1', 'DEL', 70), p('m1', 'MED', 60), p('m2', 'MED', 65), p('f1', 'DEF', 55), p('f2', 'DEF', 50)]);
    expect(ids(r)).toEqual(['DEL:d1', 'MED:m2', 'MED:m1', 'DEF:f1', 'ARQ:f2']);
    expect(r.bench).toEqual([]);
  });
  it('con pocos jugadores deja puestos vacantes', () => {
    const r = lineup([p('a1', 'ARQ', null), p('d1', 'DEL', 60)]);
    expect(ids(r)).toEqual(['DEL:d1', 'MED:-', 'MED:-', 'DEF:-', 'ARQ:a1']);
  });
});
