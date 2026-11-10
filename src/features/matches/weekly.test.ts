import { describe, expect, it } from 'vitest';
import {
  listNames, tallyVotes, weekNote, weekParts, weekSummary, WEEK_BODY_MAX, type WeekEvent, type WeekMatch, type WeekVote,
} from './weeklyCore';
import coreSrc from './weeklyCore.ts?raw';
import fnSrc from '../../../supabase/functions/push/index.ts?raw';

const NAMES: Record<string, string> = { benja: 'Benja', berna: 'Berna', tomi: 'Tomi', nico: 'Nico', lucho: 'Lucho' };
const nameOf = (id: string) => NAMES[id] ?? 'Alguien';
const m = (id: string, a: number | null, b: number | null): WeekMatch => ({ id, score_a: a, score_b: b });
const ev = (match_id: string, profile_id: string, kind: string): WeekEvent => ({ match_id, profile_id, kind });
const vote = (match_id: string, profile_id: string, votes: number): WeekVote => ({ match_id, profile_id, votes });
const times = (n: number, f: () => WeekEvent) => Array.from({ length: n }, f);

describe('tallyVotes', () => {
  it('junta los votos sueltos por partido y jugador', () => {
    expect(tallyVotes([
      { match_id: 'm1', target_id: 'berna' }, { match_id: 'm1', target_id: 'berna' }, { match_id: 'm1', target_id: 'tomi' },
      { match_id: 'm2', target_id: 'berna' },
    ])).toEqual([vote('m1', 'berna', 2), vote('m1', 'tomi', 1), vote('m2', 'berna', 1)]);
    expect(tallyVotes([])).toEqual([]);
  });
});

describe('weekSummary', () => {
  const matches = [m('m1', 3, 2), m('m2', 1, 1)];

  it('cuenta partidos, resultados, goleador y asistidor', () => {
    const s = weekSummary(matches, [
      ...times(3, () => ev('m1', 'benja', 'goal')), ev('m2', 'benja', 'goal'), ev('m1', 'tomi', 'goal'),
      ev('m1', 'berna', 'assist'), ev('m2', 'berna', 'assist'), ev('m1', 'tomi', 'assist'),
      ev('m1', 'nico', 'yellow'), ev('m1', 'nico', 'foul'),
    ], []);
    expect(s.played).toBe(2);
    expect(s.results).toEqual(['3–2', '1–1']);
    expect(s.scorers).toEqual({ ids: ['benja'], n: 4 });
    expect(s.assisters).toEqual({ ids: ['berna'], n: 2 });
    expect(s.mvp).toBeNull();
  });

  it('ignora eventos y votos de partidos fuera de la semana', () => {
    const s = weekSummary(matches, [ev('viejo', 'tomi', 'goal'), ev('m1', 'benja', 'goal')], [vote('viejo', 'tomi', 9), vote('m1', 'berna', 1)]);
    expect(s.scorers).toEqual({ ids: ['benja'], n: 1 });
    expect(s.mvp).toEqual({ ids: ['berna'], n: 1 });
  });

  it('empate en goles: todos los empatados', () => {
    const s = weekSummary(matches, [ev('m1', 'benja', 'goal'), ev('m2', 'tomi', 'goal')], []);
    expect(s.scorers!.ids.sort()).toEqual(['benja', 'tomi']);
    expect(s.scorers!.n).toBe(1);
  });

  it('sin goles ni asistencias no hay goleador ni asistidor', () => {
    const s = weekSummary(matches, [ev('m1', 'nico', 'yellow')], []);
    expect(s.scorers).toBeNull();
    expect(s.assisters).toBeNull();
  });

  it('figura de la semana: el que fue figura en más partidos', () => {
    const s = weekSummary([m('m1', 1, 0), m('m2', 2, 0), m('m3', 0, 0)], [], [
      vote('m1', 'berna', 5), vote('m1', 'tomi', 4),
      vote('m2', 'berna', 3), vote('m2', 'tomi', 1),
      vote('m3', 'tomi', 6), vote('m3', 'nico', 2),
    ]);
    expect(s.mvp).toEqual({ ids: ['berna'], n: 2 }); // 2 partidos (aunque tomi tiene más votos en total, 11 vs 8)
  });

  it('empate de figuras en victorias: desempata por votos recibidos', () => {
    const s = weekSummary([m('m1', 1, 0), m('m2', 2, 0)], [], [
      vote('m1', 'berna', 5), vote('m1', 'tomi', 1),
      vote('m2', 'tomi', 6), vote('m2', 'berna', 1),
    ]);
    expect(s.mvp).toEqual({ ids: ['tomi'], n: 1 }); // 1 partido cada uno, pero tomi suma 7 votos y berna 6
  });

  it('empate total (partidos y votos): figuras los dos', () => {
    const s = weekSummary([m('m1', 1, 0), m('m2', 2, 0)], [], [
      vote('m1', 'berna', 5), vote('m1', 'tomi', 1),
      vote('m2', 'tomi', 5), vote('m2', 'berna', 1),
    ]);
    expect(s.mvp!.ids.sort()).toEqual(['berna', 'tomi']);
    expect(s.mvp!.n).toBe(1);
  });

  it('empate de votos en un partido: figuras los dos (igual que el ranking de figuras)', () => {
    const s = weekSummary([m('m1', 1, 0)], [], [vote('m1', 'berna', 3), vote('m1', 'tomi', 3), vote('m1', 'nico', 1)]);
    expect(s.mvp!.ids.sort()).toEqual(['berna', 'tomi']);
    expect(s.mvp!.n).toBe(1);
  });

  it('sin resultado en algún partido no se muestran resultados', () => {
    expect(weekSummary([m('m1', 1, 0), m('m2', null, null)], [], []).results).toEqual([]);
    expect(weekSummary([], [], []).played).toBe(0);
  });
});

describe('listNames', () => {
  it('uno, dos o más', () => {
    expect(listNames(['A'])).toBe('A');
    expect(listNames(['A', 'B'])).toBe('A y B');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B y 1 más');
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B y 2 más');
  });
});

describe('weekNote', () => {
  it('arma título y texto con todo', () => {
    const s = weekSummary([m('m1', 3, 2), m('m2', 1, 1)], [
      ...times(4, () => ev('m1', 'benja', 'goal')), ev('m2', 'berna', 'assist'),
    ], [vote('m1', 'berna', 3), vote('m2', 'berna', 2)]);
    expect(weekNote(s, nameOf, 'Los Pibes')).toEqual({
      title: '📊 La semana en Los Pibes',
      body: '2 partidos (3–2, 1–1) · ⚽ Goleador: Benja (4) · 🎯 Asistidor: Berna (1) · ⭐ Figura: Berna (2 veces)',
    });
  });

  it('un partido, sin eventos ni votos: invita a mirar el ranking', () => {
    const s = weekSummary([m('m1', 4, 3)], [], []);
    expect(weekNote(s, nameOf, 'Los Pibes')!.body).toBe('1 partido (4–3). Mirá cómo quedó el ranking.');
  });

  it('omite lo que no hubo', () => {
    const s = weekSummary([m('m1', 2, 2)], [ev('m1', 'tomi', 'goal')], []);
    expect(weekNote(s, nameOf, 'X')!.body).toBe('1 partido (2–2) · ⚽ Goleador: Tomi (1)');
    const t = weekSummary([m('m1', null, null)], [], [vote('m1', 'nico', 1)]);
    expect(weekNote(t, nameOf, 'X')!.body).toBe('1 partido · ⭐ Figura: Nico');
  });

  it('empates se listan con plural', () => {
    const s = weekSummary([m('m1', 2, 2)], [ev('m1', 'tomi', 'goal'), ev('m1', 'benja', 'goal'), ev('m1', 'nico', 'goal')], []);
    expect(weekNote(s, nameOf, 'X')!.body).toBe('1 partido (2–2) · ⚽ Goleadores: Benja, Nico y 1 más (1)');
  });

  it('sin partidos no hay aviso', () => {
    expect(weekNote(weekSummary([], [], []), nameOf, 'X')).toBeNull();
  });

  it('nunca pasa del máximo: primero saca las asistencias, después los resultados', () => {
    const long: Record<string, string> = { a: 'Maximiliano Fernández', b: 'Bartolomé Rodríguez', c: 'Hernán Dominguez Paz' };
    const nm = (id: string) => long[id] ?? 'Alguien';
    const s = weekSummary([m('m1', 10, 12), m('m2', 11, 10), m('m3', 12, 13)], [
      ev('m1', 'a', 'goal'), ev('m1', 'b', 'assist'),
    ], [vote('m1', 'c', 3)]);
    const full = weekParts(s, nm).join(' · ');
    expect(full.length).toBeGreaterThan(WEEK_BODY_MAX);
    const note = weekNote(s, nm, 'X')!;
    expect(note.body.length).toBeLessThanOrEqual(WEEK_BODY_MAX);
    expect(note.body).not.toContain('Asistidor');
    expect(note.body).toContain('Goleador: Maximiliano Fernández (1)');
    expect(note.body).toContain('Figura: Hernán Dominguez Paz');
  });

  it('corta con puntos suspensivos si aun así no entra', () => {
    const nm = () => 'X'.repeat(70);
    const s = weekSummary([m('m1', 1, 0)], [ev('m1', 'a', 'goal')], [vote('m1', 'a', 1)]);
    const note = weekNote(s, nm, 'X')!;
    expect(note.body.length).toBeLessThanOrEqual(WEEK_BODY_MAX);
    expect(note.body.endsWith('…')).toBe(true);
  });

  it('el título no pasa de 60 caracteres', () => {
    const s = weekSummary([m('m1', 1, 0)], [], []);
    expect(weekNote(s, nameOf, 'N'.repeat(100))!.title.length).toBe(60);
  });
});

describe('Edge Function push', () => {
  it('lleva una copia exacta de weeklyCore.ts entre los marcadores SHARED', () => {
    const nl = (s: string) => s.replace(/\r\n/g, '\n').trim();
    const open = '// ===== BEGIN SHARED (copia de src/features/matches/weeklyCore.ts) =====';
    const close = '// ===== END SHARED =====';
    const a = fnSrc.indexOf(open), b = fnSrc.indexOf(close);
    expect(a, 'falta el marcador BEGIN SHARED').toBeGreaterThan(-1);
    expect(b, 'falta el marcador END SHARED').toBeGreaterThan(a);
    // Si falla: pegá todo src/features/matches/weeklyCore.ts entre los marcadores de supabase/functions/push/index.ts
    expect(nl(fnSrc.slice(a + open.length, b))).toBe(nl(coreSrc));
  });
});
