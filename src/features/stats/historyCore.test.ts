import { describe, expect, it } from 'vitest';
import {
  buildMatchHistory, chartLayout, dayMs, fmtDay, normalizeSeries, summarizeSeries, yDomain,
  type ChartBox, type MatchApp, type MatchScore,
} from './historyCore';

describe('dayMs / fmtDay', () => {
  it('parsea días y rechaza basura', () => {
    expect(dayMs('2026-11-06')).toBe(Date.UTC(2026, 10, 6));
    expect(dayMs('2026-11-06T10:00:00Z')).toBe(Date.UTC(2026, 10, 6));
    expect(dayMs('ayer')).toBeNull();
    expect(dayMs('')).toBeNull();
  });
  it('formatea "6 nov" sin depender del huso', () => {
    expect(fmtDay('2026-11-06')).toBe('6 nov');
    expect(fmtDay('2026-01-31')).toBe('31 ene');
    expect(fmtDay('x')).toBe('x');
  });
});

describe('normalizeSeries', () => {
  it('ordena por día, deja un punto por día (gana el último) y descarta filas inválidas', () => {
    const s = normalizeSeries([
      { day: '2026-11-06', ovr: 72, n_votes: 4 },
      { day: '2026-11-04', ovr: 70, n_votes: 3 },
      { day: '2026-11-06', ovr: 73, n_votes: 5 },
      { day: 'nope', ovr: 60, n_votes: 1 },
      { day: '2026-11-05', ovr: NaN, n_votes: 1 },
      { ovr: 55 },
    ]);
    expect(s.map(p => [p.day, p.ovr, p.n])).toEqual([['2026-11-04', 70, 3], ['2026-11-06', 73, 5]]);
  });
  it('tolera null/vacío', () => {
    expect(normalizeSeries(null)).toEqual([]);
    expect(normalizeSeries(undefined)).toEqual([]);
    expect(normalizeSeries([])).toEqual([]);
  });
  it('acepta números como string (PostgREST) y recorta fechas con hora', () => {
    const [p] = normalizeSeries([{ day: '2026-11-06T00:00:00', ovr: '71' as any, n_votes: '2' as any }]);
    expect(p).toMatchObject({ day: '2026-11-06', ovr: 71, n: 2 });
  });
});

describe('summarizeSeries', () => {
  const s = normalizeSeries([
    { day: '2026-11-01', ovr: 70, n_votes: 1 }, { day: '2026-11-02', ovr: 78, n_votes: 2 },
    { day: '2026-11-03', ovr: 70, n_votes: 3 }, { day: '2026-11-04', ovr: 75, n_votes: 4 },
  ]);
  it('calcula extremos y variación', () => {
    const r = summarizeSeries(s)!;
    expect(r.first.ovr).toBe(70);
    expect(r.last.ovr).toBe(75);
    expect(r.max.ovr).toBe(78);
    expect(r.min.day).toBe('2026-11-03'); // empate: el más reciente
    expect(r.delta).toBe(5);
  });
  it('es null sin puntos', () => expect(summarizeSeries([])).toBeNull());
});

describe('yDomain', () => {
  it('da aire, se queda en 1..99 y no colapsa cuando es plano', () => {
    expect(yDomain(60, 80)).toEqual([56, 84]);
    expect(yDomain(50, 50)).toEqual([47, 53]);
    expect(yDomain(97, 99)).toEqual([93, 99]);
    expect(yDomain(1, 2)).toEqual([1, 7]);
  });
});

describe('chartLayout', () => {
  const box: ChartBox = { width: 300, height: 100, left: 20, right: 20, top: 10, bottom: 10 };
  it('ubica los puntos en proporción al tiempo, con el mayor OVR más arriba', () => {
    const s = normalizeSeries([
      { day: '2026-11-01', ovr: 60, n_votes: 1 }, { day: '2026-11-02', ovr: 70, n_votes: 1 },
      { day: '2026-11-05', ovr: 80, n_votes: 1 },
    ]);
    const l = chartLayout(s, box);
    expect(l.pts.map(p => p.x)).toEqual([20, 85, 280]);
    expect(l.pts[0].y).toBeGreaterThan(l.pts[1].y);
    expect(l.pts[1].y).toBeGreaterThan(l.pts[2].y);
    expect(l.pts.every(p => p.y >= box.top && p.y <= box.height - box.bottom)).toBe(true);
    expect(l.line.startsWith('M20,')).toBe(true);
    expect(l.line.match(/L/g)).toHaveLength(2);
    expect(l.ticks[0]).toBe(l.domain[0]);
    expect(l.ticks[l.ticks.length - 1]).toBe(l.domain[1]);
  });
  it('un solo punto queda centrado y sin explotar', () => {
    const l = chartLayout(normalizeSeries([{ day: '2026-11-06', ovr: 72, n_votes: 3 }]), box);
    expect(l.pts).toHaveLength(1);
    expect(l.pts[0].x).toBe(150);
    expect(Number.isFinite(l.pts[0].y)).toBe(true);
  });
  it('sin puntos devuelve una capa vacía', () => {
    const l = chartLayout([], box);
    expect(l.pts).toEqual([]);
    expect(l.line).toBe('');
  });
});

describe('buildMatchHistory', () => {
  const app = (id: string, starts: string, team: MatchApp['team'], a: number | null, b: number | null): MatchApp =>
    ({ match_id: id, title: `Partido ${id}`, starts_at: starts, team, score_a: a, score_b: b });
  const apps = [
    app('m1', '2026-10-01T20:00:00Z', 'A', 3, 1),
    app('m3', '2026-10-15T20:00:00Z', 'B', 3, 1),
    app('m2', '2026-10-08T20:00:00Z', 'A', 2, 2),
    app('m4', '2026-10-22T20:00:00Z', null, 1, 0),
    app('m5', '2026-10-29T20:00:00Z', 'A', null, null),
  ];
  const scores: MatchScore[] = [
    { match_id: 'm1', avg: 8, n: 2 }, { match_id: 'm3', avg: 6, n: 4 }, { match_id: 'zzz', avg: 10, n: 9 },
  ];
  const h = buildMatchHistory(apps, scores);

  it('ordena del más nuevo al más viejo', () => {
    expect(h.lines.map(l => l.match_id)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
    expect(h.total).toBe(5);
  });
  it('resuelve G/E/P con el marcador desde su equipo y deja null sin equipo o resultado', () => {
    const by = Object.fromEntries(h.lines.map(l => [l.match_id, l]));
    expect(by.m1).toMatchObject({ result: 'G', score: '3-1' });
    expect(by.m3).toMatchObject({ result: 'P', score: '1-3' });
    expect(by.m2).toMatchObject({ result: 'E', score: '2-2' });
    expect(by.m4).toMatchObject({ result: null, score: null });
    expect(by.m5).toMatchObject({ result: null, score: null });
  });
  it('asocia ★ por partido e ignora puntajes de partidos que no jugó', () => {
    const by = Object.fromEntries(h.lines.map(l => [l.match_id, l]));
    expect(by.m1).toMatchObject({ avg: 8, n: 2 });
    expect(by.m2).toMatchObject({ avg: null, n: 0 });
  });
  it('promedio general ponderado por calificaciones, sobre todos los partidos (no solo los listados)', () => {
    expect(h.avg).toBe(6.7); // (8*2 + 6*4) / 6
    expect(h.nRatings).toBe(6);
    expect(h.nRated).toBe(2);
    const short = buildMatchHistory(apps, scores, 2);
    expect(short.lines).toHaveLength(2);
    expect(short.avg).toBe(6.7);
    expect(short.total).toBe(5);
  });
  it('sin partidos o sin calificaciones', () => {
    expect(buildMatchHistory([], [])).toEqual({ lines: [], total: 0, avg: null, nRatings: 0, nRated: 0 });
    expect(buildMatchHistory(apps, []).avg).toBeNull();
  });
});
