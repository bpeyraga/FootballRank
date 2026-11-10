import { describe, expect, it } from 'vitest';
import {
  aggregateStats, argDay, disciplineBoard, emptyStats, filterByRange, fmtAvg, groupMatchEvents, inRange, leaderboard, outcome, perMatch,
  statsInRange,
  type Appearance, type MatchEvent, type PlayerStats, type StatsData, type Team,
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
    ev('bob', 'yellow'), ev('bob', 'yellow'), ev('bob', 'red'), ev('zoe', 'goal'), ev('ana', 'foul'), ev('ana', 'foul'), ev('bob', 'foul')];
  const s = aggregateStats(apps, events);

  it('cuenta partidos jugados y G/E/P', () => {
    expect(s.get('ana')).toMatchObject({ pj: 3, won: 1, drawn: 1, lost: 0 });
    expect(s.get('bob')).toMatchObject({ pj: 3, won: 0, drawn: 1, lost: 1 });
  });
  it('cuenta goles, asistencias y tarjetas', () => {
    expect(s.get('ana')).toMatchObject({ goals: 2, assists: 1, fouls: 2, yellow: 0, red: 0 });
    expect(s.get('bob')).toMatchObject({ goals: 1, assists: 0, fouls: 1, yellow: 2, red: 1 });
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
    ({ pj, goals, assists, fouls: 0, yellow: 0, red: 0, won: 0, drawn: 0, lost: 0 });
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

describe('leaderboard de tarjetas', () => {
  it('ordena por tarjetas con la roja pesando como 2 amarillas', () => {
    const st = new Map([
      ['a', { ...emptyStats(), yellow: 1 }],
      ['b', { ...emptyStats(), red: 1 }],
      ['c', { ...emptyStats(), yellow: 1, red: 1 }],
      ['d', emptyStats()],
    ]);
    const rows = leaderboard([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Caro' }, { id: 'd', name: 'Dani' }], st, 'cards');
    expect(rows.map(r => [r.id, r.value, r.pos])).toEqual([['c', 3, 1], ['b', 2, 2], ['a', 1, 3]]);
  });
});

describe('leaderboard de faltas', () => {
  it('ordena por cantidad de faltas y oculta a quien no tiene', () => {
    const st = new Map([
      ['a', { ...emptyStats(), fouls: 2 }],
      ['b', { ...emptyStats(), fouls: 5, yellow: 1 }],
      ['c', emptyStats()],
    ]);
    const rows = leaderboard([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Caro' }], st, 'fouls');
    expect(rows.map(r => [r.id, r.value, r.pos])).toEqual([['b', 5, 1], ['a', 2, 2]]);
  });
});

describe('disciplineBoard (tarjetas y faltas)', () => {
  const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Caro' }, { id: 'd', name: 'Dani' }, { id: 'e', name: 'Eli' }];
  it('ordena por tarjetas, desempata por faltas y después por nombre; incluye a quien solo tiene faltas', () => {
    const st = new Map([
      ['a', { ...emptyStats(), pj: 2, fouls: 1 }],
      ['b', { ...emptyStats(), pj: 3, yellow: 1, fouls: 4 }],
      ['c', { ...emptyStats(), pj: 1, yellow: 1, fouls: 2 }],
      ['d', { ...emptyStats(), pj: 1, red: 1 }],
      ['e', emptyStats()],
    ]);
    const rows = disciplineBoard(players, st);
    expect(rows.map(r => [r.id, r.value, r.fouls, r.pos])).toEqual([['d', 2, 0, 1], ['b', 1, 4, 2], ['c', 1, 2, 3], ['a', 0, 1, 4]]);
    expect(rows[1].pj).toBe(3);
  });
  it('comparte posición solo si empata en tarjetas y faltas', () => {
    const st = new Map([
      ['a', { ...emptyStats(), yellow: 1, fouls: 2 }],
      ['b', { ...emptyStats(), yellow: 1, fouls: 2 }],
      ['c', { ...emptyStats(), yellow: 1, fouls: 1 }],
    ]);
    expect(disciplineBoard(players, st).map(r => [r.name, r.pos])).toEqual([['Ana', 1], ['Beto', 1], ['Caro', 3]]);
  });
  it('sin datos devuelve una lista vacía', () => {
    expect(disciplineBoard(players, new Map())).toEqual([]);
  });
});

describe('faltas en los eventos', () => {
  it('groupMatchEvents las ordena después de las asistencias y antes de las tarjetas', () => {
    const events = [ev('ana', 'red'), ev('ana', 'yellow'), ev('ana', 'foul'), ev('ana', 'assist'), ev('ana', 'goal')];
    const g = groupMatchEvents(events, () => 'A');
    expect(g[0].groups.map(x => x.kind)).toEqual(['goal', 'assist', 'foul', 'yellow', 'red']);
  });
  it('los eventos con minuto siguen contando igual en las estadísticas', () => {
    const e1: MatchEvent = { ...ev('ana', 'foul'), minute: 12 };
    expect(aggregateStats([], [e1, { ...ev('ana', 'goal'), minute: null }]).get('ana')).toMatchObject({ fouls: 1, goals: 1 });
  });
});

describe('por fechas (temporadas)', () => {
  it('argDay: el día en Argentina (UTC-3), no el de UTC', () => {
    expect(argDay('2026-01-02T02:59:59Z')).toBe('2026-01-01');   // todavía es 1/1 a las 23:59 en Argentina
    expect(argDay('2026-01-02T03:00:00Z')).toBe('2026-01-02');
    expect(argDay('2026-11-06T21:00:00-03:00')).toBe('2026-11-06');
    expect(argDay(Date.UTC(2026, 11, 31, 23, 0))).toBe('2026-12-31');
    expect(argDay(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31');
    expect(argDay('no es una fecha')).toBe('');
  });
  it('inRange: inclusivo en los dos extremos, sin tope con null y sin rango entra todo', () => {
    const r = { from: '2026-03-01', to: '2026-06-30' };
    expect(inRange('2026-03-01', r)).toBe(true);
    expect(inRange('2026-06-30', r)).toBe(true);
    expect(inRange('2026-02-28', r)).toBe(false);
    expect(inRange('2026-07-01', r)).toBe(false);
    expect(inRange('2030-01-01', { from: '2026-03-01', to: null })).toBe(true);
    expect(inRange('2020-01-01', { from: null, to: '2026-06-30' })).toBe(true);
    expect(inRange('2020-01-01', null)).toBe(true);
    expect(inRange('', r)).toBe(false);
    expect(inRange('', null)).toBe(true);
  });
  it('filterByRange: usa el día de Argentina del partido (un partido de las 22:00 no se cae al día siguiente)', () => {
    const items = [
      { id: 1, starts_at: '2026-03-01T00:30:00Z' },   // 28/2 21:30 en Argentina: fuera
      { id: 2, starts_at: '2026-03-01T03:00:00Z' },   // 1/3 00:00: dentro
      { id: 3, starts_at: '2026-07-01T01:00:00Z' },   // 30/6 22:00 en Argentina: dentro
      { id: 4, starts_at: '2026-07-01T03:00:00Z' },   // 1/7: fuera
      { id: 5, starts_at: 'basura' },
    ];
    const r = { from: '2026-03-01', to: '2026-06-30' };
    expect(filterByRange(items, r).map(i => i.id)).toEqual([2, 3]);
    expect(filterByRange(items, null)).toBe(items);
    expect(filterByRange(items, { from: null, to: null }).map(i => i.id)).toEqual([1, 2, 3, 4]);   // sin topes: solo cae lo inválido
  });
  it('statsInRange: agrega solo los partidos del rango; sin rango es el histórico', () => {
    const d1 = '2026-03-05T21:00:00Z', d2 = '2026-08-05T21:00:00Z';
    const data: StatsData = {
      appearances: [
        { ...ap('m1', 'ana', 'A', 2, 0), starts_at: d1 }, { ...ap('m2', 'ana', 'B', 1, 3), starts_at: d2 },
        { ...ap('m1', 'bob', 'B', 2, 0), starts_at: d1 },
      ],
      events: [
        { profile_id: 'ana', kind: 'goal', starts_at: d1 }, { profile_id: 'ana', kind: 'goal', starts_at: d2 },
        { profile_id: 'bob', kind: 'red', starts_at: d1 }, { profile_id: 'ana', kind: 'foul', starts_at: d2 },
      ],
    };
    const first = statsInRange(data, { from: '2026-03-01', to: '2026-06-30' });
    expect(first.get('ana')).toMatchObject({ pj: 1, goals: 1, fouls: 0, won: 1 });
    expect(first.get('bob')).toMatchObject({ pj: 1, red: 1, lost: 1 });
    const all = statsInRange(data, null);
    expect(all.get('ana')).toMatchObject({ pj: 2, goals: 2, fouls: 1, won: 2 });
    expect(statsInRange(data, { from: '2027-01-01', to: null }).size).toBe(0);
    // sale lo mismo que el agregado de siempre
    expect(all).toEqual(aggregateStats(data.appearances, data.events));
  });
});
