import { describe, expect, it } from 'vitest';
import { aggregateStats } from './statsCore';
import { attendanceFrom, playerAttendance, playerStatsFrom, signupMap, type PlayedMatch, type PlayerEvent, type Signup } from './playCore';
import { computeAchievements, sortAchievements, type Achievement, type AchievementInput } from './achievements';
import { computeDuos } from './duos';
import { mvpBoard, presenceBoard } from '../ranking/boards';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 21)).toISOString();
/** Partido número n (cronológico), con resultado opcional. */
const M = (n: number, a: number | null = null, b: number | null = null): PlayedMatch => ({ id: `m${n}`, starts_at: day(n), score_a: a, score_b: b });
const S = (n: number, pid: string, team: 'A' | 'B' | null = 'A', absent = false): Signup => ({ match_id: `m${n}`, profile_id: pid, team, absent });
const E = (n: number, kind: PlayerEvent['kind'], times = 1): PlayerEvent[] => Array.from({ length: times }, () => ({ match_id: `m${n}`, kind }));
const at = (n: number) => +new Date(day(n));

describe('presentismo', () => {
  const matches = [1, 2, 3, 4, 5].map(n => M(n));

  it('cuenta jugados, ausencias, racha y los últimos partidos', () => {
    const mine = [S(1, 'p'), S(2, 'p'), S(3, 'p', 'A', true), S(4, 'p'), S(5, 'p')];
    const a = playerAttendance(matches, mine, null);
    expect(a).toMatchObject({ total: 5, played: 4, absences: 1, pct: 80, streak: 2 });
    expect(a.recent).toEqual(['played', 'played', 'absent', 'played', 'played']);
  });

  it('no anotarse es "missed" y corta la racha', () => {
    const a = playerAttendance(matches, [S(1, 'p'), S(2, 'p'), S(3, 'p')], null);
    expect(a).toMatchObject({ total: 5, played: 3, absences: 0, pct: 60, streak: 0 });
    expect(a.recent.slice(-2)).toEqual(['missed', 'missed']);
  });

  it('no cuenta los partidos de antes de sumarse, salvo que haya jugado', () => {
    const joined = day(2); // entró a la hora del partido 2
    const a = playerAttendance(matches, [S(4, 'p'), S(5, 'p')], joined);
    expect(a).toMatchObject({ total: 4, played: 2, pct: 50 });
    const b = playerAttendance(matches, [S(1, 'p'), S(5, 'p')], joined);
    expect(b.total).toBe(5); // jugó el 1 aunque fuera anterior
    expect(b.pct).toBe(40);
  });

  it('sin partidos: pct null; ordena por fecha aunque lleguen desordenados', () => {
    expect(playerAttendance([], [], null)).toMatchObject({ total: 0, pct: null, streak: 0, recent: [] });
    const rev = [...matches].reverse();
    expect(playerAttendance(rev, [S(5, 'p')], null).streak).toBe(1);
  });

  it('recent se corta en 10', () => {
    const many = Array.from({ length: 14 }, (_, i) => M(i + 1));
    expect(attendanceFrom(many, signupMap([]), null).recent).toHaveLength(10);
  });
});

describe('playerStatsFrom', () => {
  it('coincide con aggregateStats (sin contar ausentes ni partidos de otra comunidad)', () => {
    const matches = [M(1, 2, 1), M(2, 0, 0), M(3, null, null)];
    const mine = [S(1, 'p', 'A'), S(2, 'p', 'B'), S(3, 'p', 'A', true), S(9, 'p', 'A')];
    const events = [...E(1, 'goal', 2), ...E(1, 'yellow'), ...E(2, 'assist')];
    const st = playerStatsFrom('p', matches, mine, events);
    const ref = aggregateStats([
      { match_id: 'm1', profile_id: 'p', team: 'A', score_a: 2, score_b: 1 },
      { match_id: 'm2', profile_id: 'p', team: 'B', score_a: 0, score_b: 0 },
    ], events.map(e => ({ profile_id: 'p', kind: e.kind }))).get('p');
    expect(st).toEqual(ref);
    expect(st).toMatchObject({ pj: 2, goals: 2, assists: 1, yellow: 1, won: 1, drawn: 1, lost: 0 });
  });
  it('sin nada: ceros', () => {
    expect(playerStatsFrom('p', [], [], [])).toMatchObject({ pj: 0, goals: 0 });
  });
});

describe('computeAchievements', () => {
  const base = (over: Partial<AchievementInput>): AchievementInput =>
    ({ matches: [], mine: [], events: [], mvpTimes: 0, joinedAt: null, ...over });
  const get = (list: Achievement[], id: string) => list.find(a => a.id === id)!;
  const play = (n: number, team: 'A' | 'B' | null = 'A') => Array.from({ length: n }, (_, i) => S(i + 1, 'p', team));

  it('sin partidos: todo bloqueado con avance 0', () => {
    const l = computeAchievements(base({}));
    expect(l).toHaveLength(16);
    expect(l.every(a => !a.unlocked && a.have === 0 && a.at == null)).toBe(true);
  });

  it('debut y hitos de partidos jugados, con la fecha del partido que los destrabó', () => {
    const matches = Array.from({ length: 12 }, (_, i) => M(i + 1));
    const l = computeAchievements(base({ matches, mine: play(12) }));
    expect(get(l, 'debut')).toMatchObject({ unlocked: true, at: at(1) });
    expect(get(l, 'pj10')).toMatchObject({ unlocked: true, at: at(10) });
    expect(get(l, 'pj25')).toMatchObject({ unlocked: false, have: 12, goal: 25 });
  });

  it('las ausencias no suman partidos', () => {
    const l = computeAchievements(base({ matches: [M(1), M(2)], mine: [S(1, 'p', 'A', true), S(2, 'p')] }));
    expect(get(l, 'pj10').have).toBe(1);
  });

  it('goles: primer gol, hat-trick (con cantidad), goleador y progreso', () => {
    const matches = [M(1, 1, 0), M(2, 5, 0), M(3, 4, 1), M(4, 0, 0)];
    const events = [...E(1, 'goal'), ...E(2, 'goal', 3), ...E(3, 'goal', 4), ...E(4, 'goal', 2)];
    const l = computeAchievements(base({ matches, mine: play(4), events }));
    expect(get(l, 'goal1')).toMatchObject({ unlocked: true, at: at(1) });
    expect(get(l, 'hat')).toMatchObject({ unlocked: true, at: at(2), times: 2 });
    expect(get(l, 'goal10')).toMatchObject({ unlocked: true, at: at(4) }); // 1+3+4=8, +2=10 en el 4
    expect(get(l, 'ast10')).toMatchObject({ unlocked: false, have: 0, goal: 10 });
  });

  it('hat-trick bloqueado muestra el mejor partido', () => {
    const l = computeAchievements(base({ matches: [M(1, 2, 0)], mine: [S(1, 'p')], events: E(1, 'goal', 2) }));
    expect(get(l, 'hat')).toMatchObject({ unlocked: false, have: 2, goal: 3 });
  });

  it('valla invicta: según el equipo del jugador y solo con resultado', () => {
    // 1: A ganó 3-0 (concedió 0); 2: A perdió 0-2 (concedió 2); 3: sin resultado; 4: 1-1 (concedió 1)
    const matches = [M(1, 3, 0), M(2, 0, 2), M(3, null, null), M(4, 1, 1)];
    const l = computeAchievements(base({ matches, mine: play(4) }));
    expect(get(l, 'clean')).toMatchObject({ unlocked: true, at: at(1), times: null });
    // Del lado B en un 0-2 el arco quedó en cero (el A no marcó)
    const b = computeAchievements(base({ matches: [M(2, 0, 2)], mine: [S(2, 'p', 'B')] }));
    expect(get(b, 'clean').unlocked).toBe(true);
    const sinEquipo = computeAchievements(base({ matches: [M(1, 3, 0)], mine: [S(1, 'p', null)] }));
    expect(get(sinEquipo, 'clean').unlocked).toBe(false);
  });

  it('victorias y racha de 3 (los partidos sin resultado no la cortan)', () => {
    const matches = [M(1, 1, 0), M(2, 2, 0), M(3, 0, 1), M(4, 3, 0), M(5, null, null), M(6, 1, 0), M(7, 2, 1)];
    const l = computeAchievements(base({ matches, mine: play(7) }));
    // 1,2 ganados; 3 perdido; 4 ganado; 5 sin resultado; 6 y 7 ganados => racha de 3 en el 7
    expect(get(l, 'streak3')).toMatchObject({ unlocked: true, at: at(7) });
    expect(get(l, 'win10')).toMatchObject({ unlocked: false, have: 5 });
  });

  it('racha bloqueada muestra la mejor', () => {
    const matches = [M(1, 1, 0), M(2, 2, 0), M(3, 0, 1)];
    const l = computeAchievements(base({ matches, mine: play(3) }));
    expect(get(l, 'streak3')).toMatchObject({ unlocked: false, have: 2, goal: 3 });
  });

  it('fair play: 10 partidos seguidos sin tarjetas; una tarjeta reinicia', () => {
    const matches = Array.from({ length: 12 }, (_, i) => M(i + 1));
    const clean = computeAchievements(base({ matches, mine: play(12) }));
    expect(get(clean, 'fair')).toMatchObject({ unlocked: true, at: at(10) });
    const carded = computeAchievements(base({ matches, mine: play(12), events: E(5, 'yellow') }));
    expect(get(carded, 'fair')).toMatchObject({ unlocked: false, have: 7 }); // partidos 6 a 12
  });

  it('primera roja: desbloquea y cuenta repeticiones', () => {
    const matches = [M(1), M(2), M(3)];
    const l = computeAchievements(base({ matches, mine: play(3), events: [...E(2, 'red'), ...E(3, 'red')] }));
    expect(get(l, 'red')).toMatchObject({ unlocked: true, at: at(2), times: 2 });
    expect(get(computeAchievements(base({ matches, mine: play(3) })), 'red').unlocked).toBe(false);
  });

  it('figura y crack salen del contador, sin fecha', () => {
    const l = computeAchievements(base({ mvpTimes: 5 }));
    expect(get(l, 'mvp1')).toMatchObject({ unlocked: true, at: null, times: 5 });
    expect(get(l, 'mvp5')).toMatchObject({ unlocked: true });
    const m = computeAchievements(base({ mvpTimes: 2 }));
    expect(get(m, 'mvp1')).toMatchObject({ unlocked: true, times: 2 });
    expect(get(m, 'mvp5')).toMatchObject({ unlocked: false, have: 2, goal: 5 });
  });

  it('siempre presente: asistencia perfecta en la ventana, mínimo 5', () => {
    const many = Array.from({ length: 12 }, (_, i) => M(i + 1));
    // faltó al 1 y al 2 (fuera de la ventana de 10) y jugó 3..12
    const ok = computeAchievements(base({ matches: many, mine: many.slice(2).map((_, i) => S(i + 3, 'p')) }));
    expect(get(ok, 'always')).toMatchObject({ unlocked: true, at: at(12) });
    // faltó al 5: dentro de la ventana
    const bad = computeAchievements(base({ matches: many, mine: play(12).filter(s => s.match_id !== 'm5') }));
    expect(get(bad, 'always')).toMatchObject({ unlocked: false, have: 7, goal: 10 });
    // pocos partidos en la comunidad: no alcanza
    const few = [M(1), M(2), M(3)];
    expect(get(computeAchievements(base({ matches: few, mine: play(3) })), 'always')).toMatchObject({ unlocked: false, have: 3, goal: 5 });
    // justo 5 y todos jugados
    const five = [1, 2, 3, 4, 5].map(n => M(n));
    expect(get(computeAchievements(base({ matches: five, mine: play(5) })), 'always').unlocked).toBe(true);
  });

  it('siempre presente ignora los partidos anteriores a sumarse', () => {
    const matches = Array.from({ length: 6 }, (_, i) => M(i + 1));
    const l = computeAchievements(base({ matches, joinedAt: day(2), mine: play(6).slice(1) }));
    expect(get(l, 'always').unlocked).toBe(true); // 5 partidos desde que entró, todos jugados
    const m = computeAchievements(base({ matches, joinedAt: day(2), mine: play(6).slice(2) }));
    expect(get(m, 'always').unlocked).toBe(false);
  });

  it('orden: desbloqueados del más nuevo al más viejo, sin fecha al final; bloqueados por cercanía', () => {
    const mk = (id: string, unlocked: boolean, when: number | null, have = 0, goal = 10): Achievement =>
      ({ id, emoji: '', name: id, desc: '', have, goal, unlocked, at: when, times: null });
    const sorted = sortAchievements([
      mk('lejos', false, null, 1), mk('viejo', true, 100), mk('sinfecha', true, null),
      mk('cerca', false, null, 8), mk('nuevo', true, 900),
    ]);
    expect(sorted.map(a => a.id)).toEqual(['nuevo', 'viejo', 'sinfecha', 'cerca', 'lejos']);
  });

  it('el avance de un bloqueado nunca llega a la meta', () => {
    const l = computeAchievements(base({ mvpTimes: 0 }));
    expect(l.filter(a => !a.unlocked).every(a => a.have < a.goal)).toBe(true);
  });
});

describe('computeDuos', () => {
  // yo = 'me' siempre en el equipo A.
  // m1 gané 2-0 con ana y beto contra dani; m2 gané 1-0 con ana contra beto y eli; m3 gané 3-1 con ana y beto contra eli;
  // m4 perdí 0-1 con cris contra dani; m5 perdí 0-2 con cris contra eli; m6 empaté 1-1 contra eli.
  const matches = [M(1, 2, 0), M(2, 1, 0), M(3, 3, 1), M(4, 0, 1), M(5, 0, 2), M(6, 1, 1)];
  const signups: Signup[] = [
    S(1, 'me', 'A'), S(1, 'ana', 'A'), S(1, 'beto', 'A'), S(1, 'dani', 'B'),
    S(2, 'me', 'A'), S(2, 'ana', 'A'), S(2, 'beto', 'B'), S(2, 'eli', 'B'),
    S(3, 'me', 'A'), S(3, 'ana', 'A'), S(3, 'beto', 'A'), S(3, 'eli', 'B'),
    S(4, 'me', 'A'), S(4, 'cris', 'A'), S(4, 'dani', 'B'),
    S(5, 'me', 'A'), S(5, 'cris', 'A'), S(5, 'eli', 'B'),
    S(6, 'me', 'A'), S(6, 'eli', 'B'),
  ];

  it('compañeros: % de victorias juntos, mínimo 2 partidos y solo con victorias', () => {
    const d = computeDuos('me', matches, signups);
    // ana 3 de 3; beto 2 de 2 (m1 y m3); cris 0 de 2 (no aparece)
    expect(d.mates.map(r => [r.id, r.games, r.wins, r.pct])).toEqual([['ana', 3, 3, 100], ['beto', 2, 2, 100]]);
  });

  it('rivales: % de derrotas en contra', () => {
    const d = computeDuos('me', matches, signups);
    // dani: m1 gané, m4 perdí => 1 de 2 = 50 %; eli: m2 gané, m3 gané, m5 perdí, m6 empaté => 1 de 4 = 25 %; beto en contra solo 1 partido
    expect(d.rivals.map(r => [r.id, r.games, r.losses, r.pct])).toEqual([['dani', 2, 1, 50], ['eli', 4, 1, 25]]);
  });

  it('ignora ausentes, partidos sin equipo o sin resultado', () => {
    const ms2 = [M(1, 2, 0), M(2, 2, 0), M(3, null, null)];
    const sg = [S(1, 'me'), S(1, 'x'), S(2, 'me'), S(2, 'x', 'A', true), S(3, 'me'), S(3, 'x'), S(1, 'y', null), S(2, 'y', null)];
    expect(computeDuos('me', ms2, sg)).toEqual({ mates: [], rivals: [] });
  });

  it('top 3 y desempate por cantidad de partidos', () => {
    const mt = [1, 2, 3, 4].map(n => M(n, 1, 0));
    const sg: Signup[] = [1, 2, 3, 4].map(n => S(n, 'me'));
    for (const id of ['a', 'b', 'c', 'd']) for (const n of id === 'a' ? [1, 2, 3, 4] : [1, 2]) sg.push(S(n, id));
    const d = computeDuos('me', mt, sg);
    expect(d.mates).toHaveLength(3);
    expect(d.mates[0].id).toBe('a'); // mismo 100 %, más partidos
  });

  it('si yo no jugué (o estuve ausente) el partido no cuenta', () => {
    const sg = [S(1, 'me', 'A', true), S(1, 'x'), S(2, 'x')];
    expect(computeDuos('me', [M(1, 1, 0), M(2, 1, 0)], sg)).toEqual({ mates: [], rivals: [] });
  });
});

describe('tablas', () => {
  const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Cris' }, { id: 'd', name: 'Dani' }];

  it('mvpBoard: ordena, comparte posición en empates y oculta ceros / desconocidos', () => {
    const rows = mvpBoard(players, [
      { profile_id: 'c', times: 2 }, { profile_id: 'a', times: 2 }, { profile_id: 'b', times: 1 }, { profile_id: 'zzz', times: 9 },
    ]);
    expect(rows.map(r => [r.name, r.value, r.pos])).toEqual([['Ana', 2, 1], ['Cris', 2, 1], ['Beto', 1, 3]]);
    expect(mvpBoard(players, [])).toEqual([]);
  });

  it('presenceBoard: % desde que se sumó, desempate por partidos jugados', () => {
    const matches = [1, 2, 3, 4].map(n => M(n));
    const signups = [
      S(1, 'a'), S(2, 'a'), S(3, 'a'), S(4, 'a'),             // 100 %
      S(3, 'b'), S(4, 'b'),                                    // entró en el 3: 100 % de 2
      S(1, 'c'), S(2, 'c'), S(3, 'c', 'A', true), S(4, 'c'),   // 75 %, 1 ausencia
    ];
    const joined = new Map([['a', day(0)], ['b', day(3)], ['c', day(0)], ['d', day(0)]]);
    const rows = presenceBoard(players, matches, signups, joined);
    expect(rows.map(r => [r.name, r.pct, r.played, r.total, r.pos])).toEqual([
      ['Ana', 100, 4, 4, 1], ['Beto', 100, 2, 2, 2], ['Cris', 75, 3, 4, 3],
    ]);
    expect(rows[2]).toMatchObject({ absences: 1, streak: 1 });
    expect(rows.find(r => r.name === 'Dani')).toBeUndefined(); // nunca jugó
  });

  it('presenceBoard sin partidos: vacía', () => {
    expect(presenceBoard(players, [], [], new Map())).toEqual([]);
  });
});
