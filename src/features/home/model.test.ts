import { describe, expect, it } from 'vitest';
import { inviteCode, memberCounts, nextByCommunity, quickActions, signupSummary, tierOf, type MyComm, type Next } from './model';

const comm = (id: string, role = 'member'): MyComm => ({ role, community: { id, name: `C${id}`, slug: `c${id}` } });
const nx = (id: string, community_id: string, status = 'open'): Next =>
  ({ id, community_id, title: 'P', starts_at: '2026-11-10T21:00:00Z', location: null, slots: 10, status });

describe('inviteCode', () => {
  it('del link o el código suelto', () => {
    expect(inviteCode('https://x.app/#/join/abc123XY')).toBe('abc123XY');
    expect(inviteCode('  abc123  ')).toBe('abc123');
    expect(inviteCode('hola')).toBeNull();
    expect(inviteCode('https://x.app/#/c/algo')).toBeNull();
  });
});

describe('resúmenes', () => {
  it('miembros por comunidad', () => {
    expect(memberCounts([{ community_id: 'a' }, { community_id: 'a' }, { community_id: 'b' }])).toEqual({ a: 2, b: 1 });
  });
  it('el primer partido de cada comunidad', () => {
    const n = nextByCommunity([nx('1', 'a'), nx('2', 'b'), nx('3', 'a')]);
    expect(n.a.id).toBe('1');
    expect(n.b.id).toBe('2');
  });
  it('anotados, espera y lo mío', () => {
    const rows = [{ profile_id: 'me', status: 'waitlist' }, { profile_id: 'x', status: 'in' }, { profile_id: 'y', status: 'out' }];
    expect(signupSummary(rows, 'me')).toEqual({ taken: 1, waiting: 1, mine: 'waitlist' });
    expect(signupSummary([{ profile_id: 'me', status: 'out' }], 'me').mine).toBeNull();
  });
  it('tierOf', () => {
    expect([tierOf(null), tierOf(80), tierOf(70), tierOf(50)]).toEqual(['none', 'gold', 'silver', 'bronze']);
  });
});

describe('quickActions', () => {
  it('sin comunidades, nada', () => {
    expect(quickActions(null, [])).toEqual([]);
    expect(quickActions(null, null)).toEqual([]);
  });
  it('no repite el "Anotarme" del cartel del próximo partido', () => {
    const q = quickActions(nx('m1', '2'), [comm('1', 'admin'), comm('2')]);
    expect(q.map(x => x.label)).toEqual(['Crear partido', 'Ranking', 'Chat']);
    expect(q.some(x => /m\/m1/.test(x.href))).toBe(false);
    expect(q[0].href).toBe('#/c/c1');          // admin en otra comunidad
    expect(q[1].href).toBe('#/c/c2/ranking');  // la del próximo partido
    expect(q[2].href).toBe('#/c/c2/chat');
  });
  it('un miembro (sin comunidades propias) ve ranking y chat de su comunidad', () => {
    const q = quickActions(nx('m', '1', 'closed'), [comm('1')]);
    expect(q.map(x => x.label)).toEqual(['Ranking', 'Chat']);
    expect(q.map(x => x.href)).toEqual(['#/c/c1/ranking', '#/c/c1/chat']);
  });
  it('sin próximo partido usa la primera comunidad', () => {
    expect(quickActions(null, [comm('7', 'owner'), comm('8')]).map(x => x.href)).toEqual(['#/c/c7', '#/c/c7/ranking', '#/c/c7/chat']);
  });
});
