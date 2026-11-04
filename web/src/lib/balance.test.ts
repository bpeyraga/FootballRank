import { describe, expect, it } from 'vitest';
import { balance, type BPlayer } from './balance';
import type { Pos } from './supabase';

const mk = (id: string, pos: Pos, o: number): BPlayer =>
  ({ id, pos, ovr: o, attrs: { rit: o, tir: o, pas: o, reg: o, def: o, fis: o } });

describe('balance', () => {
  it('reparte 10 jugadores en 5+5 con los arqueros separados', () => {
    const ps = [mk('a', 'ARQ', 70), mk('b', 'ARQ', 60), ...Array.from({ length: 8 }, (_, i) => mk('p' + i, 'MED', 50 + i * 5))];
    const [best] = balance(ps);
    expect(best.A.length).toBe(5); expect(best.B.length).toBe(5);
    expect(best.A.filter(p => p.pos === 'ARQ').length).toBe(1);
    const sum = (x: BPlayer[]) => x.reduce((t, p) => t + p.ovr, 0);
    expect(Math.abs(sum(best.A) - sum(best.B))).toBeLessThanOrEqual(10);
  });
  it('maneja impares y grupos grandes (heurística)', () => {
    expect(balance([mk('a', 'MED', 50), mk('b', 'MED', 60), mk('c', 'DEL', 70)])[0].A.length).toBeGreaterThan(0);
    const big = Array.from({ length: 24 }, (_, i) => mk('x' + i, 'MED', 40 + i));
    const [b] = balance(big);
    expect(b.A.length + b.B.length).toBe(24);
  });
});
