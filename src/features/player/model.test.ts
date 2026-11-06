import { describe, expect, it } from 'vitest';
import { activeSuspensions, byValue, cleanCode, customTarget, historySummary, playedHistory } from './model';
import type { CustomRow } from '../stats/customStats';

const match = (id: string, starts_at: string) => ({ id, title: id, starts_at, score_a: 2, score_b: 1 });

describe('historial', () => {
  it('junta notas, ordena del más nuevo y marca faltas', () => {
    const list = playedHistory(
      [{ team: 'A', absent: null, match: match('viejo', '2026-10-01T21:00:00Z') }, { team: 'B', absent: true, match: match('nuevo', '2026-11-01T21:00:00Z') }],
      [{ match_id: 'viejo', avg_score: '7.5', n: 4 }],
    );
    expect(list.map(m => m.id)).toEqual(['nuevo', 'viejo']);
    expect(list[1]).toMatchObject({ rating: 7.5, n: 4, absent: false });
    expect(list[0]).toMatchObject({ rating: null, n: 0, absent: true });
  });
  it('promedio solo de calificados presentes', () => {
    const base = { title: '', starts_at: '', team: 'A' as const, score_a: 1, score_b: 0 };
    const s = historySummary([
      { ...base, id: '1', rating: 7, n: 3, absent: false },
      { ...base, id: '2', rating: 8, n: 3, absent: false },
      { ...base, id: '3', rating: 2, n: 1, absent: true },
      { ...base, id: '4', rating: null, n: 0, absent: false },
    ]);
    expect(s).toEqual({ rated: 2, absences: 1, avg: '7,5' });
    expect(historySummary([]).avg).toBeNull();
  });
});

describe('suspensiones activas', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const m = (status: string, h: number) => ({ title: 'P', status, starts_at: new Date(now + h * 3600e3).toISOString() });
  it('pendientes y de partidos por jugarse (hasta 3 h después)', () => {
    const rows = [
      { id: 'pend', reason: null, match: null },
      { id: 'prox', reason: null, match: m('open', 24) },
      { id: 'recien', reason: null, match: m('closed', -2) },
      { id: 'vieja', reason: null, match: m('open', -5) },
      { id: 'jugado', reason: null, match: m('played', 24) },
    ];
    expect(activeSuspensions(rows, now).map(x => x.id)).toEqual(['pend', 'prox', 'recien']);
  });
});

describe('stats de la casa', () => {
  const row = (id: string, created_by: string, label: string, value = 50): CustomRow => ({ id, created_by, label, value, hidden: false, code: null });
  it('actualiza la mía aunque cambien las mayúsculas', () => {
    expect(customTarget([row('1', 'me', 'Morfón'), row('2', 'otro', 'morfón')], 'me', 'MORFÓN')).toEqual({ existing: '1', dup: null });
  });
  it('nueva si no la tengo', () => {
    expect(customTarget([row('2', 'otro', 'Morfón')], 'me', 'Morfón')).toEqual({ existing: undefined, dup: null });
  });
  it('al renombrar una mía a otra que ya tengo, choca', () => {
    const list = [row('1', 'me', 'Caño'), row('2', 'me', 'Morfón')];
    expect(customTarget(list, 'me', 'morfón', '1').dup?.id).toBe('2');
  });
  it('orden y código', () => {
    expect(byValue([row('a', 'x', 'A', 10), row('b', 'x', 'B', 90)]).map(r => r.id)).toEqual(['b', 'a']);
    expect(cleanCode('mño!x')).toBe('MÑO');
  });
});
