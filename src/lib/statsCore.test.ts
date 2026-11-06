import { describe, expect, it } from 'vitest';
import {
  aggregateStats, fmtAvg, groupMatchEvents, leaderboard, outcome, perMatch,
  type Appearance, type MatchEvent, type PlayerStats, type Team,
} from './statsCore';

const ap = (match_id: string, profile_id: string, team: Team | null, a: number | null, b: number | null): Appearance =>
  ({ match_id, profile_id, team, score_a: a, score_b: b });
let seq = 0;
const ev = (profile_id: string, kind: MatchEvent['kind'], match_id = 'm1'): MatchEvent =>
  ({ id: ++seq, match_id, community_id: 'c', profile_id, kind, created_by: 'x', created_at: '' });

describe('outcome', () => {
  it('resuelve ganado/empatado/perdido según el equipo', () => {
    expect(outcome('A', 3, 1)).toBe('won');
    expect(outcome('B', 3, 1)).toBe('lost');
    expect(outcome('B', 0, 2)).toBe('won');
    expect(outcome('A', 2, 2)).toBe('drawn');
  });
  it('es null sin equipo o sin marcador', () => {
    expect(outcome(null, 1, 0)).toBeNull();
    expect(outcome('A', null, 0)).toBeNull();
    expect(outcome('A', 0, null)).toBeNull();
  });
});

describe('aggregateStats', () => {
  const apps = [
    ap('m1', 'ana', 'A', 3, 1), ap('m1', 'bob', 'B', 3, 1),
    ap('m2', 'ana', 'B', 2, 2), ap('m2', 'bob', 'A', 2, 2),
    ap('m3', 'ana', null, 1, 0),            // sin equipo: suma PJ pero no G/E/P
    ap('m4', 'bob', 'A', null, null),       // sin marcador: suma PJ pero no G/E/P
  ];
  const events = [ev('ana', 'goal'), ev('ana', 'goal'), ev('bob', 'goal'), ev('ana', 'assist'),
    ev('bob', 'yellow'), ev('bob', 'yellow'), ev('bob', 'red'), ev('zoe', 'goal')];
  const s = aggregateStats(apps, events);

  it('cuenta partidos jugados y G/E/P', () => {
    expect(s.get('ana')).toMatchObject({ pj: 3, won: 1, drawn: 1, lost: 0 });
    expect(s.get('bob')).toMatchObject({ pj: 3, won: 0, drawn: 1, lost: 1 });
  });
  it('cuenta goles, asistencias y tarjetas', () => {
    expect(s.get('ana')).toMatchObject({ goals: 2, assists: 1, yellow: 0, red: 0 });
    expect(s.get('bob')).toMatchObject({ goals: 1, assists: 0, yellow: 2, red: 1 });
  });
  it('incluye a quien tiene eventos pero no participaciones', () => {
    expect(s.get('zoe')).toMatchObject({ pj: 0, goals: 1 });
  });
  it('sin datos devuelve un mapa vacío', () => {
    expect(aggregateStats([], []).size).toBe(0);
  });
});

describe('perMatch', () => {
  it('promedia con 2 decimales y evita dividir por cero', () => {
    expect(perMatch(5, 3)).toBe(1.67);
    expect(perMatch(0, 0)).toBe(0);
    expect(perMatch(4, 0)).toBe(0);
  });
});

describe('leaderboard', () => {
  const st = (goals: number, assists = 0, pj = 1): PlayerStats =>
    ({ pj, goals, assists, yellow: 0, red: 0, won: 0, drawn: 0, lost: 0 });
  const players = ['Carla', 'Ana', 'Beto', 'Dani', 'Eli'].map(name => ({ id: name.toLowerCase(), name }));
  const stats = new Map([['carla', st(3)], ['ana', st(3)], ['beto', st(5)], ['dani', st(0, 2)]]);

  it('ordena por valor, desempata por nombre y comparte posición en empates', () => {
    const rows = leaderboard(players, stats, 'goals');
    expect(rows.map(r => [r.name, r.value, r.pos])).toEqual([['Beto', 5, 1], ['Ana', 3, 2], ['Carla', 3, 2]]);
  });
  it('oculta ceros y a quien no tiene stats', () => {
    expect(leaderboard(players, stats, 'assists').map(r => r.name)).toEqual(['Dani']);
    expect(leaderboard(players, new Map(), 'goals')).toEqual([]);
  });
  it('salta posiciones después de un empate', () => {
    const more = new Map([...stats, ['eli', st(1)]]);
    expect(leaderboard(players, more, 'goals').map(r => r.pos)).toEqual([1, 2, 2, 4]);
  });
});

describe('groupMatchEvents', () => {
  const teamOf = (id: string): Team | null => ({ ana: 'A', bob: 'B', cami: 'A' } as Record<string, Team>)[id] ?? null;

  it('agrupa por equipo, jugador y tipo, con goles primero', () => {
    const events = [ev('ana', 'yellow'), ev('cami', 'goal'), ev('ana', 'goal'), ev('ana', 'goal'), ev('bob', 'assist'), ev('zoe', 'red')];
    const g = groupMatchEvents(events, teamOf);
    expect(g.map(t => t.team)).toEqual(['A', 'B', 'none']);
    const a = g[0];
    expect(a.goals).toBe(3);
    expect(a.groups.map(x => [x.profile_id, x.kind, x.events.length])).toEqual([['ana', 'goal', 2], ['cami', 'goal', 1], ['ana', 'yellow', 1]]);
    expect(g[1].goals).toBe(0);
  });
  it('sin equipos deja todo en "none" y omite equipos vacíos', () => {
    const g = groupMatchEvents([ev('ana', 'goal'), ev('bob', 'goal')], () => null);
    expect(g.length).toBe(1);
    expect(g[0].team).toBe('none');
    expect(g[0].goals).toBe(2);
    expect(groupMatchEvents([], teamOf)).toEqual([]);
  });
});

describe('fmtAvg', () => {
  it('usa coma decimal', () => {
    expect(fmtAvg(1.5)).toBe('1,5');
    expect(fmtAvg(2)).toBe('2');
  });
});
