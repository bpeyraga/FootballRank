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
  it('a igual OVR, por nombre', () => {
    const out = buildRanking([{ role: 'member', profile: p('z', 'Zoe') }, { role: 'member', profile: p('y', 'Ale') }], [], [], []);
    expect(out.map(r => r.profile.name)).toEqual(['Ale', 'Zoe']);
  });
});
