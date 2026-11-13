import { describe, expect, it } from 'vitest';
import {
  LATER_KEY, PROMPT_WINDOW_MS, SKIP_KEY, VOTE_OPENS_AFTER_MS, VOTE_WINDOW_MS, addId, mvpOpen, myVoteState, promptQueue, ratingOpen,
  ratingsLeft, readIds, voteHeadline, voteOpensAt, type PendingVote, type Store, type VoteSignup,
} from './votingCore';

const H = 3_600_000, D = 24 * H;
const NOW = Date.parse('2026-11-14T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const m = (status: string, msAgo: number) => ({ status, starts_at: at(msAgo) });

describe('ventana de votación', () => {
  it('jugado: se puede votar siempre; la figura cierra a los 7 días', () => {
    expect(ratingOpen(m('played', 10 * H), NOW)).toBe(true);
    expect(mvpOpen(m('played', 10 * H), NOW)).toBe(true);
    expect(ratingOpen(m('played', 30 * D), NOW)).toBe(true);
    expect(mvpOpen(m('played', 30 * D), NOW)).toBe(false);
    expect(mvpOpen(m('played', VOTE_WINDOW_MS), NOW)).toBe(true); // justo a los 7 días todavía vale (el servidor cierra al pasarse)
    expect(mvpOpen(m('played', VOTE_WINDOW_MS + 1), NOW)).toBe(false);
  });

  it('sin resultado cargado: desde 2 h después de la hora de inicio y hasta 7 días', () => {
    for (const st of ['open', 'closed']) {
      expect(ratingOpen(m(st, 1 * H), NOW)).toBe(false);
      expect(ratingOpen(m(st, VOTE_OPENS_AFTER_MS - 1), NOW)).toBe(false);
      expect(ratingOpen(m(st, VOTE_OPENS_AFTER_MS), NOW)).toBe(true);
      expect(mvpOpen(m(st, 5 * H), NOW)).toBe(true);
      expect(ratingOpen(m(st, 6 * D), NOW)).toBe(true);
      expect(ratingOpen(m(st, VOTE_WINDOW_MS), NOW)).toBe(false);
      expect(mvpOpen(m(st, 8 * D), NOW)).toBe(false);
    }
  });

  it('un partido que todavía no empezó, o cancelado, no se vota', () => {
    expect(ratingOpen(m('open', -3 * H), NOW)).toBe(false);
    expect(ratingOpen(m('cancelled', 5 * H), NOW)).toBe(false);
    expect(mvpOpen(m('cancelled', 5 * H), NOW)).toBe(false);
  });

  it('voteOpensAt: 2 h después del inicio', () => {
    expect(voteOpensAt('2026-11-14T00:00:00Z')).toBe(Date.parse('2026-11-14T02:00:00Z'));
  });
});

describe('qué puedo hacer yo en el partido', () => {
  const su = (id: string, o: Partial<VoteSignup> = {}): VoteSignup => ({ profile_id: id, status: 'in', absent: false, team: 'A', ...o });
  const open = m('open', 5 * H);
  const state = (match: { status: string; starts_at: string }, signups: VoteSignup[], myMvp: string | null = null, ratings: Record<string, number> = {}, ready = true) =>
    myVoteState(match, signups, 'yo', myMvp, ready, ratings, NOW);

  it('jugué con equipo: figura y calificar; pendientes hasta que voto', () => {
    expect(state(open, [su('yo'), su('b'), su('c', { team: 'B' })])).toEqual(
      { plays: true, canMvp: true, canRate: true, mates: ['b'], pendingMvp: true, pendingRate: true });
    expect(state(open, [su('yo'), su('b')], 'b', { b: 7 })).toMatchObject({ canMvp: true, pendingMvp: false, pendingRate: false });
    expect(state(open, [su('yo'), su('b'), su('c')], 'b', { b: 7 })).toMatchObject({ mates: ['b', 'c'], pendingMvp: false, pendingRate: true });
  });
  it('mientras no se leyó mi voto de figura no se sabe si me falta', () => {
    expect(state(open, [su('yo'), su('b')], null, {}, false)).toMatchObject({ canMvp: true, pendingMvp: false });
  });
  it('sin equipos armados se puede votar la figura pero no calificar', () => {
    expect(state(open, [su('yo', { team: null }), su('b', { team: null })]))
      .toEqual({ plays: true, canMvp: true, canRate: false, mates: [], pendingMvp: true, pendingRate: false });
  });
  it('los compañeros ausentes, en espera o del otro equipo no cuentan', () => {
    const s = [su('yo'), su('aus', { absent: true }), su('esp', { status: 'waitlist' }), su('rival', { team: 'B' }), su('b')];
    expect(state(open, s).mates).toEqual(['b']);
  });
  it('lista de espera, ausente o desconocido: nada', () => {
    const none = { plays: false, canMvp: false, canRate: false, mates: [], pendingMvp: false, pendingRate: false };
    expect(state(open, [su('yo', { status: 'waitlist' })])).toEqual(none);
    expect(state(open, [su('yo', { absent: true })])).toEqual(none);
    expect(state(open, [su('b')])).toEqual(none);
  });
  it('antes de las 2 h o pasados los 7 días no queda pendiente', () => {
    expect(state(m('open', 1 * H), [su('yo'), su('b')])).toMatchObject({ canMvp: false, pendingMvp: false, pendingRate: false });
    expect(state(m('played', 9 * D), [su('yo'), su('b')])).toMatchObject({ canMvp: false, canRate: true, mates: ['b'], pendingMvp: false, pendingRate: false });
  });
});

describe('encabezado del bloque de votar', () => {
  it('según lo que falta', () => {
    expect(voteHeadline(true, true)).toMatchObject({ icon: '🏆', title: '¡Falta tu voto!' });
    expect(voteHeadline(true, false).text).toMatch(/figura/);
    expect(voteHeadline(false, true).title).toMatch(/calificar/);
    expect(voteHeadline(false, false).icon).toBe('✅');
  });
});

describe('pedido al abrir la app', () => {
  const pv = (id: string, msAgo: number, o: Partial<PendingVote> = {}): PendingVote => ({
    match_id: id, community_id: 'c', slug: 'c', community_name: 'C', title: id, starts_at: at(msAgo), status: 'played', mates: 4, rated: 0, ...o,
  });

  it('más nuevos primero y solo los de los últimos 3 días', () => {
    const rows = [pv('viejo', 2.5 * D), pv('nuevo', 5 * H), pv('muy-viejo', 4 * D), pv('medio', 30 * H)];
    expect(promptQueue(rows, new Set(), NOW).map(r => r.match_id)).toEqual(['nuevo', 'medio', 'viejo']);
    expect(PROMPT_WINDOW_MS).toBe(3 * D);
  });
  it('saca los descartados', () => {
    const rows = [pv('a', 5 * H), pv('b', 6 * H)];
    expect(promptQueue(rows, new Set(['a']), NOW).map(r => r.match_id)).toEqual(['b']);
    expect(promptQueue(rows, new Set(['a', 'b']), NOW)).toEqual([]);
  });
  it('un abierto con menos de 2 h o uno futuro (reloj del celular corrido) no se pide', () => {
    expect(promptQueue([pv('a', 1 * H, { status: 'open' })], new Set(), NOW)).toEqual([]);
    expect(promptQueue([pv('a', -1 * H)], new Set(), NOW)).toEqual([]);
    expect(promptQueue([pv('a', 3 * H, { status: 'open' })], new Set(), NOW)).toHaveLength(1);
  });
  it('compañeros que faltan calificar', () => {
    expect(ratingsLeft({ mates: 4, rated: 1 })).toBe(3);
    expect(ratingsLeft({ mates: 4, rated: 4 })).toBe(0);
    expect(ratingsLeft({ mates: 0, rated: 0 })).toBe(0);
    expect(ratingsLeft({ mates: 2, rated: 5 })).toBe(0);
  });
});

describe('"Después" y "No jugué"', () => {
  const mem = (init: Record<string, string> = {}): Store & { data: Record<string, string> } => {
    const data = { ...init };
    return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  };

  it('guarda ids sin repetir', () => {
    const s = mem();
    addId(s, LATER_KEY, 'a'); addId(s, LATER_KEY, 'b'); addId(s, LATER_KEY, 'a');
    expect(readIds(s, LATER_KEY)).toEqual(['b', 'a']);
    expect(readIds(s, SKIP_KEY)).toEqual([]);
  });
  it('guarda como mucho 30 (se van los más viejos)', () => {
    const s = mem();
    for (let i = 0; i < 35; i++) addId(s, SKIP_KEY, `m${i}`);
    const ids = readIds(s, SKIP_KEY);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('m5');
    expect(ids[29]).toBe('m34');
  });
  it('sin storage o con datos rotos no falla', () => {
    expect(readIds(null, SKIP_KEY)).toEqual([]);
    expect(readIds(mem({ [SKIP_KEY]: '{no json' }), SKIP_KEY)).toEqual([]);
    expect(readIds(mem({ [SKIP_KEY]: '{"a":1}' }), SKIP_KEY)).toEqual([]);
    expect(readIds(mem({ [SKIP_KEY]: '["a",3,null,"b"]' }), SKIP_KEY)).toEqual(['a', 'b']);
    expect(() => addId(null, SKIP_KEY, 'a')).not.toThrow();
    const broken: Store = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(readIds(broken, SKIP_KEY)).toEqual([]);
    expect(() => addId(broken, SKIP_KEY, 'a')).not.toThrow();
  });
});
