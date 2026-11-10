import { describe, expect, it } from 'vitest';
import {
  applyTeams, autoScore, bump, buildEvents, buildPlayers, clampScore, defaultStart, eventCounts, lastEvent,
  parseLocal, quickError, selectAll, setSide, tally, toLocalInput, toggleSide, validateQuick, warnings,
  type CountsMap, type Sel,
} from './quickMatch';

const NOW = new Date(2026, 10, 6, 22, 30); // 6/11/2026 22:30 (hora local)

describe('defaultStart', () => {
  it('hoy 21:00 si ya pasó', () => {
    const d = defaultStart(new Date(2026, 10, 6, 22, 0));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 6, 21, 0]);
  });
  it('ayer 21:00 si hoy todavía no son las 21', () => {
    const d = defaultStart(new Date(2026, 10, 6, 20, 59));
    expect([d.getDate(), d.getHours()]).toEqual([5, 21]);
  });
  it('cruza de mes y a las 21:00 justas es hoy', () => {
    expect(defaultStart(new Date(2026, 10, 1, 9, 0)).getMonth()).toBe(9);
    expect(defaultStart(new Date(2026, 10, 1, 21, 0)).getDate()).toBe(1);
  });
  it('siempre queda en el pasado o ahora', () => {
    for (let h = 0; h < 24; h++) {
      const now = new Date(2026, 10, 6, h, 15);
      expect(+defaultStart(now)).toBeLessThanOrEqual(+now);
    }
  });
});

describe('fecha local', () => {
  it('toLocalInput / parseLocal van y vuelven', () => {
    expect(toLocalInput(new Date(2026, 10, 5, 21, 0))).toBe('2026-11-05T21:00');
    const d = parseLocal('2026-11-05T21:00')!;
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([5, 21, 0]);
    expect(parseLocal('')).toBeNull();
    expect(parseLocal('basura')).toBeNull();
  });
});

describe('quiénes jugaron', () => {
  it('setSide / toggleSide', () => {
    let s: Sel = {};
    s = toggleSide(s, 'a'); expect(s).toEqual({ a: 'X' });
    s = setSide(s, 'a', 'B'); expect(s).toEqual({ a: 'B' });
    expect(setSide(s, 'a', 'B')).toBe(s); // sin cambios: misma referencia
    s = toggleSide(s, 'a'); expect(s).toEqual({}); // con equipo: lo saca
    expect(setSide(s, 'zz', null)).toBe(s);
  });
  it('selectAll conserva los equipos ya elegidos', () => {
    expect(selectAll({ a: 'A' }, ['a', 'b', 'c'])).toEqual({ a: 'A', b: 'X', c: 'X' });
  });
  it('applyTeams y tally', () => {
    const s = applyTeams({ a: 'X', b: 'X', c: 'X', d: 'X' }, ['a', 'c'], ['b']);
    expect(s).toEqual({ a: 'A', b: 'B', c: 'A', d: 'X' });
    expect(tally(s)).toEqual({ a: 2, b: 1, none: 1, total: 4 });
  });
});

describe('contadores', () => {
  it('bump respeta mínimo y topes por tipo', () => {
    let m: CountsMap = {};
    expect(bump(m, 'a', 'goal', -1)).toBe(m);
    m = bump(m, 'a', 'goal', 1); m = bump(m, 'a', 'goal', 1);
    expect(m.a.goal).toBe(2);
    m = bump(m, 'a', 'red', 1); expect(bump(m, 'a', 'red', 1)).toBe(m); // roja: máximo 1
    m = bump(m, 'a', 'yellow', 1); m = bump(m, 'a', 'yellow', 1);
    expect(bump(m, 'a', 'yellow', 1).a.yellow).toBe(2); // amarilla: máximo 2
    expect(m.a.goal).toBe(2); // no pisa los otros
    m = bump(m, 'a', 'foul', 1); m = bump(m, 'a', 'foul', 1);
    expect(m.a.foul).toBe(2); // las faltas cuentan aparte, sin tope de 2
    expect(bump(m, 'a', 'foul', -5).a.foul).toBe(0);
  });
});

describe('resultado automático', () => {
  const sel: Sel = { a: 'A', b: 'A', c: 'B', d: 'X' };
  it('suma los goles de cada equipo y no cuenta a los sin equipo', () => {
    const counts: CountsMap = { a: { goal: 2, assist: 1, foul: 0, yellow: 0, red: 0 }, b: { goal: 1, assist: 0, foul: 0, yellow: 0, red: 0 },
      c: { goal: 4, assist: 0, foul: 0, yellow: 0, red: 0 }, d: { goal: 9, assist: 0, foul: 0, yellow: 0, red: 0 }, z: { goal: 7, assist: 0, foul: 0, yellow: 0, red: 0 } };
    expect(autoScore(sel, counts)).toEqual({ a: 3, b: 4 });
  });
  it('sin goles es 0-0 y clampScore acota', () => {
    expect(autoScore(sel, {})).toEqual({ a: 0, b: 0 });
    expect(clampScore(-3)).toBe(0); expect(clampScore(150)).toBe(99); expect(clampScore(NaN)).toBe(0);
  });
  it('avisa si hay más goles cargados que en el resultado', () => {
    const counts: CountsMap = { a: { goal: 3, assist: 0, foul: 0, yellow: 0, red: 0 } };
    expect(warnings(sel, counts, 2, 0)).toEqual(['Cargaste 3 goles del Equipo A y el resultado dice 2.']);
    expect(warnings(sel, counts, 3, 0)).toEqual([]);
    expect(warnings(sel, { c: { goal: 1, assist: 0, foul: 0, yellow: 0, red: 0 } }, 0, 0)).toEqual(['Cargaste 1 gol del Equipo B y el resultado dice 0.']);
  });
});

describe('armado del pedido', () => {
  const sel: Sel = { a: 'A', b: 'B', c: 'X' };
  it('buildPlayers: X va sin equipo', () => {
    expect(buildPlayers(sel)).toEqual([{ id: 'a', team: 'A' }, { id: 'b', team: 'B' }, { id: 'c', team: null }]);
  });
  it('buildEvents: un renglón por evento y solo de quienes jugaron', () => {
    const counts: CountsMap = {
      a: { goal: 2, assist: 1, foul: 2, yellow: 0, red: 0 }, b: { goal: 0, assist: 0, foul: 0, yellow: 1, red: 1 },
      zz: { goal: 5, assist: 0, foul: 0, yellow: 0, red: 0 }, // no jugó: no se manda
    };
    expect(buildEvents(sel, counts)).toEqual([
      { id: 'a', kind: 'goal' }, { id: 'a', kind: 'goal' }, { id: 'a', kind: 'assist' }, { id: 'a', kind: 'foul' }, { id: 'a', kind: 'foul' },
      { id: 'b', kind: 'yellow' }, { id: 'b', kind: 'red' },
    ]);
    expect(buildEvents(sel, {})).toEqual([]);
  });
});

describe('validateQuick', () => {
  const base = { sel: { a: 'A', b: 'B' } as Sel, counts: {} as CountsMap, a: 0, b: 0, when: '2026-11-05T21:00', now: NOW };
  it('acepta un partido completo', () => { expect(validateQuick(base)).toBeNull(); });
  it('pide al menos 2 jugadores', () => {
    expect(validateQuick({ ...base, sel: { a: 'A' } })).toBe('Marcá al menos 2 jugadores.');
    expect(validateQuick({ ...base, sel: {} })).toBe('Marcá al menos 2 jugadores.');
  });
  it('no deja mezclar con y sin equipo, pero sí todos sin equipo', () => {
    expect(validateQuick({ ...base, sel: { a: 'A', b: 'B', c: 'X' } })).toContain('1 jugador sin equipo');
    expect(validateQuick({ ...base, sel: { a: 'A', b: 'X', c: 'X' } })).toContain('2 jugadores sin equipo');
    expect(validateQuick({ ...base, sel: { a: 'X', b: 'X' } })).toBeNull();
  });
  it('la fecha tiene que existir y ser pasada', () => {
    expect(validateQuick({ ...base, when: '' })).toContain('Elegí la fecha');
    expect(validateQuick({ ...base, when: '2026-11-07T21:00' })).toContain('pasada');
    expect(validateQuick({ ...base, when: '2026-11-06T22:30' })).toBeNull(); // justo ahora: ya empezó
  });
  it('el resultado va de 0 a 99', () => {
    expect(validateQuick({ ...base, a: -1 })).toContain('entre 0 y 99');
    expect(validateQuick({ ...base, b: 100 })).toContain('entre 0 y 99');
    expect(validateQuick({ ...base, a: 1.5 })).toContain('entre 0 y 99');
  });
  it('tope de eventos', () => {
    const sel: Sel = { a: 'A', b: 'B' };
    const counts: CountsMap = { a: { goal: 30, assist: 30, foul: 0, yellow: 2, red: 1 } };
    expect(validateQuick({ ...base, sel, counts })).toBeNull();
    const many: CountsMap = {}; const big: Sel = {};
    for (let i = 0; i < 6; i++) { big['p' + i] = i % 2 ? 'A' : 'B'; many['p' + i] = { goal: 30, assist: 30, foul: 0, yellow: 0, red: 0 }; }
    expect(validateQuick({ ...base, sel: big, counts: many })).toContain('demasiados');
  });
});

describe('quickError', () => {
  it('traduce cada código del servidor', () => {
    const msg = (c: string) => quickError(`${c}`);
    expect(msg('forbidden')).toContain('admins');
    expect(msg('not_started')).toContain('pasada');
    expect(msg('bad_score')).toContain('0 y 99');
    expect(msg('bad_venue')).toContain('cancha');
    expect(msg('bad_input')).toContain('demasiados');
    expect(msg('few_players')).toContain('2 jugadores');
    expect(msg('bad_team')).toContain('equipo');
    expect(msg('not_member')).toContain('miembro');
    expect(msg('bad_event')).toContain('goles o tarjetas');
    expect(quickError('TypeError: Failed to fetch')).toContain('Sin conexión');
    expect(quickError('Could not find the function public.load_played_match')).toContain('habilitada');
    expect(quickError('algo raro')).toContain('algo raro');
  });
});

describe('goles y tarjetas del partido', () => {
  const evs = [
    { id: 1, profile_id: 'a', kind: 'goal' as const }, { id: 2, profile_id: 'b', kind: 'goal' as const },
    { id: 3, profile_id: 'a', kind: 'goal' as const }, { id: 4, profile_id: 'a', kind: 'yellow' as const },
    { id: 5, profile_id: 'b', kind: 'foul' as const }, { id: 6, profile_id: 'b', kind: 'foul' as const },
  ];
  it('eventCounts cuenta por jugador y tipo', () => {
    expect(eventCounts(evs)).toEqual({
      a: { goal: 2, assist: 0, foul: 0, yellow: 1, red: 0 }, b: { goal: 1, assist: 0, foul: 2, yellow: 0, red: 0 },
    });
    expect(eventCounts([])).toEqual({});
  });
  it('lastEvent devuelve el más reciente de ese jugador y tipo', () => {
    expect(lastEvent(evs, 'a', 'goal')?.id).toBe(3);
    expect(lastEvent(evs, 'b', 'goal')?.id).toBe(2);
    expect(lastEvent(evs, 'b', 'red')).toBeUndefined();
  });
});
