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
    expect(quickActions(null, null, [])).toEqual([]);
  });
  it('anotarme destacado si la lista está abierta y no estoy', () => {
    const q = quickActions(nx('m1', '2'), { taken: 3, waiting: 0, mine: null }, [comm('1', 'admin'), comm('2')]);
    expect(q.map(x => x.label)).toEqual(['Anotarme', 'Crear partido', 'Ranking']);
    expect(q[0]).toMatchObject({ href: '#/c/c2/m/m1', main: true });
    expect(q[1].href).toBe('#/c/c1');     // admin en otra comunidad
    expect(q[2].href).toBe('#/c/c2/ranking'); // la del próximo partido
  });
  it('ya anotado o lista cerrada', () => {
    expect(quickActions(nx('m', '1'), { taken: 1, waiting: 0, mine: 'in' }, [comm('1')])[0]).toMatchObject({ label: 'Ver lista', main: false });
    expect(quickActions(nx('m', '1', 'closed'), null, [comm('1')])[0]).toMatchObject({ label: 'Ver partido', main: false });
  });
});
