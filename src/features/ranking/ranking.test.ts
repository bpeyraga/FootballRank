import { describe, expect, it } from 'vitest';
import { buildRanking } from './ranking';
import type { Profile } from '../../shared/model';

const p = (id: string, name: string): Profile =>
  ({ id, name, pos: 'MED', photo_url: null, user_id: null, onboarded: true, nickname: null, shirt_number: null, fav_team: null });
const st = (v: number) => ({ rit: v, tir: v, pas: v, reg: v, def: v, fis: v });

describe('buildRanking', () => {
  it('junta votos, autoevaluación y mi voto; ordena por OVR y deja a los sin votos al final', () => {
    const out = buildRanking(
      [{ role: 'member', profile: p('a', 'Ana') }, { role: 'owner', profile: p('b', 'Beto') }, { role: 'member', profile: p('c', 'Caro') }],
      [{ profile_id: 'a', ...st(60), ovr: 60, n_votes: 2 }, { profile_id: 'b', ...st(80), ovr: 80, n_votes: 5 }],
      [{ target_id: 'a', ...st(70) }],
      [{ profile_id: 'c', ...st(55) }],
    );
    expect(out.map(r => r.profile.id)).toEqual(['b', 'a', 'c']);
    expect(out[1]).toMatchObject({ ovr: 60, nVotes: 2, mine: st(70), base: null });
    expect(out[2]).toMatchObject({ ovr: null, nVotes: 0, votes: null, base: st(55), mine: null });
  });
  it('el OVR sale ponderado por la posición de cada uno (no del promedio simple)', () => {
    const del = { ...p('d', 'Delan'), pos: 'DEL' as const }, def = { ...p('f', 'Defen'), pos: 'DEF' as const };
    const stats = { rit: 80, tir: 85, pas: 70, reg: 80, def: 30, fis: 65 }; // promedio simple 68
    const out = buildRanking([{ role: 'member', profile: def }, { role: 'member', profile: del }],
      [{ profile_id: 'd', ...stats, ovr: 68, n_votes: 1 }, { profile_id: 'f', ...stats, ovr: 68, n_votes: 1 }], [], []);
    expect(out.map(r => [r.profile.id, r.ovr])).toEqual([['d', 76], ['f', 58]]);
  });
  it('a igual OVR, por nombre', () => {
    const out = buildRanking([{ role: 'member', profile: p('z', 'Zoe') }, { role: 'member', profile: p('y', 'Ale') }], [], [], []);
    expect(out.map(r => r.profile.name)).toEqual(['Ale', 'Zoe']);
  });
});
