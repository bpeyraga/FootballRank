import { describe, expect, it } from 'vitest';
import {
  EARLY_MS, LATE_MS, applyDelete, applyInsert, canStartLive, chronological, clockOffset, elapsedSec, fmtClock, fmtMinute,
  isLive, lastEventOf, lastMineOf, liveError, liveLabel, mayBeMyPending, minuteOf, scoreFromEvents, settleInsert, type LiveClock,
} from './live';
import type { EventKind, Team } from '../stats/statsCore';

const T0 = Date.parse('2026-11-12T21:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('reloj', () => {
  it('corriendo: acumulado + lo que pasó desde live_since', () => {
    const c: LiveClock = { live_state: 'running', live_half: 1, live_since: iso(T0), live_elapsed: 90 };
    expect(elapsedSec(c, T0)).toBe(90);
    expect(elapsedSec(c, T0 + 30_000)).toBe(120);
    expect(elapsedSec(c, T0 + 30_999)).toBe(120); // segundos enteros
  });
  it('en pausa o terminado: queda el acumulado, aunque pase el tiempo', () => {
    expect(elapsedSec({ live_state: 'paused', live_since: null, live_elapsed: 600 }, T0 + 999_999)).toBe(600);
    expect(elapsedSec({ live_state: 'ended', live_since: iso(T0), live_elapsed: 3000 }, T0 + 5000)).toBe(3000);
  });
  it('nunca da negativo ni NaN (reloj del celular atrasado o datos raros)', () => {
    const c: LiveClock = { live_state: 'running', live_since: iso(T0), live_elapsed: 10 };
    expect(elapsedSec(c, T0 - 60_000)).toBe(10);
    expect(elapsedSec({ live_state: 'running', live_since: 'nada', live_elapsed: 5 }, T0)).toBe(5);
    expect(elapsedSec({ live_state: 'running', live_since: null, live_elapsed: 7 }, T0)).toBe(7);
    expect(elapsedSec({}, T0)).toBe(0);
    expect(elapsedSec({ live_state: null, live_elapsed: -5 }, T0)).toBe(0);
  });
  it('pausa y reanudación suman bien (flujo completo)', () => {
    // arranca en T0, pausa a los 10 min, reanuda 5 min después, a los 3 min de jugar mira el reloj
    const paused: LiveClock = { live_state: 'paused', live_half: 1, live_since: null, live_elapsed: 600 };
    const resumed: LiveClock = { ...paused, live_state: 'running', live_since: iso(T0 + 15 * 60_000) };
    expect(elapsedSec(resumed, T0 + 18 * 60_000)).toBe(600 + 180);
  });
  it('2º tiempo: el reloj sigue desde lo acumulado (minutos continuos)', () => {
    const second: LiveClock = { live_state: 'running', live_half: 2, live_since: iso(T0), live_elapsed: 25 * 60 };
    expect(fmtClock(elapsedSec(second, T0))).toBe('25:00');
    expect(minuteOf(elapsedSec(second, T0 + 61_000))).toBe(27);
  });
});

describe('formato', () => {
  it('fmtClock: mm:ss con ceros y minutos de más de 2 cifras', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(65)).toBe('01:05');
    expect(fmtClock(59.9)).toBe('00:59');
    expect(fmtClock(100 * 60 + 5)).toBe('100:05');
    expect(fmtClock(-3)).toBe('00:00');
    expect(fmtClock(NaN)).toBe('00:00');
  });
  it('minuteOf: 1 durante el primer minuto y tope 200', () => {
    expect(minuteOf(0)).toBe(1);
    expect(minuteOf(59)).toBe(1);
    expect(minuteOf(60)).toBe(2);
    expect(minuteOf(23 * 60 + 45)).toBe(24);
    expect(minuteOf(99999)).toBe(200);
    expect(minuteOf(-4)).toBe(1);
  });
  it('fmtMinute: con apóstrofo, vacío si no hay minuto', () => {
    expect(fmtMinute(23)).toBe("23'");
    expect(fmtMinute(0)).toBe("0'");
    expect(fmtMinute(null)).toBe('');
    expect(fmtMinute(undefined)).toBe('');
  });
  it('liveLabel según el estado', () => {
    expect(liveLabel({ live_state: 'running', live_half: 1 })).toBe('1er tiempo');
    expect(liveLabel({ live_state: 'running', live_half: 2 })).toBe('2º tiempo');
    expect(liveLabel({ live_state: 'paused', live_half: 1 })).toBe('En pausa');
    expect(liveLabel({ live_state: 'paused', live_half: 2 })).toContain('2º tiempo');
    expect(liveLabel({ live_state: 'ended', live_half: 2 })).toBe('Terminó');
    expect(liveLabel({ live_state: null })).toBe('');
  });
  it('isLive', () => {
    expect(isLive({ live_state: 'paused' })).toBe(true);
    expect(isLive({ live_state: 'ended' })).toBe(true);
    expect(isLive({ live_state: null })).toBe(false);
    expect(isLive({})).toBe(false);
  });
});

describe('clockOffset', () => {
  it('corrige un celular adelantado o atrasado asumiendo respuesta a mitad de camino', () => {
    // el celular marca 12:00:00.000 al pedir y 12:00:00.400 al recibir; el servidor dijo 11:59:00.200
    const sent = Date.parse('2026-11-12T12:00:00.000Z'), recv = sent + 400;
    expect(clockOffset(sent - 60_000 + 200, sent, recv)).toBe(-60_000);
    expect(clockOffset(sent + 5_000 + 200, sent, recv)).toBe(5_000);
    expect(clockOffset(1000, 1000, 1000)).toBe(0);
  });
});

describe('canStartLive', () => {
  const base = { status: 'open', starts_at: iso(T0), live_state: null as null };
  it('hoy: desde 2 h antes hasta 24 h después', () => {
    expect(canStartLive(base, T0)).toBe(true);
    expect(canStartLive(base, T0 - EARLY_MS)).toBe(true);
    expect(canStartLive(base, T0 - EARLY_MS - 1)).toBe(false);
    expect(canStartLive(base, T0 + LATE_MS)).toBe(true);
    expect(canStartLive(base, T0 + LATE_MS + 1)).toBe(false);
  });
  it('no si ya está en vivo, está jugado o cancelado, o la base no tiene el reloj', () => {
    expect(canStartLive({ ...base, live_state: 'running' }, T0)).toBe(false);
    expect(canStartLive({ ...base, live_state: 'ended' }, T0)).toBe(false);
    expect(canStartLive({ ...base, status: 'played' }, T0)).toBe(false);
    expect(canStartLive({ ...base, status: 'cancelled' }, T0)).toBe(false);
    expect(canStartLive({ status: 'closed', starts_at: iso(T0) }, T0)).toBe(false); // live_state undefined
    expect(canStartLive({ ...base, status: 'closed' }, T0)).toBe(true);
    expect(canStartLive({ ...base, starts_at: 'x' }, T0)).toBe(false);
  });
});

describe('scoreFromEvents', () => {
  const teamOf = (id: string): Team | null => ({ ana: 'A', bob: 'B', cami: 'A' } as Record<string, Team>)[id] ?? null;
  const ev = (profile_id: string, kind: EventKind) => ({ profile_id, kind });
  it('cuenta solo goles, por equipo del jugador', () => {
    const evs = [ev('ana', 'goal'), ev('cami', 'goal'), ev('bob', 'goal'), ev('ana', 'assist'), ev('bob', 'foul'), ev('bob', 'yellow')];
    expect(scoreFromEvents(evs, teamOf)).toEqual({ a: 2, b: 1 });
  });
  it('los goles de quien no tiene equipo no suman; sin eventos es 0-0', () => {
    expect(scoreFromEvents([ev('zoe', 'goal')], teamOf)).toEqual({ a: 0, b: 0 });
    expect(scoreFromEvents([], teamOf)).toEqual({ a: 0, b: 0 });
  });
});

describe('eventos en orden y en tiempo real', () => {
  type E = { id: number; profile_id: string; kind: EventKind; created_by?: string | null };
  const e = (id: number, profile_id = 'ana', kind: EventKind = 'goal', created_by: string | null = 'yo'): E => ({ id, profile_id, kind, created_by });

  it('chronological pone los provisorios (negativos) al final, el más nuevo último', () => {
    expect(chronological([e(-2), e(7), e(-1), e(3)]).map(x => x.id)).toEqual([3, 7, -1, -2]);
  });
  it('lastEventOf devuelve el más reciente (aunque sea provisorio)', () => {
    expect(lastEventOf([e(3), e(7), e(5)])?.id).toBe(7);
    expect(lastEventOf([e(3), e(-1), e(-2)])?.id).toBe(-2);
    expect(lastEventOf([])).toBeUndefined();
  });
  it('lastMineOf: el último que cargué yo, aunque otro admin haya cargado uno después', () => {
    const list = [e(1, 'ana', 'goal', 'yo'), e(2, 'bob', 'foul', 'otro'), e(3, 'cami', 'goal', 'otro')];
    expect(lastMineOf(list, 'yo')?.id).toBe(1);
    expect(lastMineOf(list, 'nadie')).toBeUndefined();
    expect(lastMineOf([...list, e(-1, 'ana', 'goal', 'yo')], 'yo')?.id).toBe(-1);
  });
  it('applyInsert agrega lo nuevo e ignora repetidos', () => {
    const list = [e(1)];
    expect(applyInsert(list, e(1))).toBe(list);
    expect(applyInsert(list, e(2, 'bob', 'foul', 'otro')).map(x => x.id)).toEqual([1, 2]);
  });
  it('mayBeMyPending: solo si es mío y tengo una fila provisoria del mismo jugador y tipo', () => {
    const pending = [e(1), e(-1, 'ana', 'goal', 'yo')];
    expect(mayBeMyPending(pending, e(9, 'ana', 'goal', 'yo'), 'yo')).toBe(true);
    expect(mayBeMyPending(pending, e(9, 'ana', 'goal', 'otro'), 'yo')).toBe(false); // lo cargó otro admin
    expect(mayBeMyPending(pending, e(9, 'ana', 'assist', 'yo'), 'yo')).toBe(false);  // otro tipo
    expect(mayBeMyPending(pending, e(9, 'bob', 'goal', 'yo'), 'yo')).toBe(false);    // otro jugador
    expect(mayBeMyPending([e(1)], e(9, 'ana', 'goal', 'yo'), 'yo')).toBe(false);     // nada en camino
  });
  it('applyDelete saca por id y no toca la lista si no está', () => {
    const list = [e(1), e(2)];
    expect(applyDelete(list, 1).map(x => x.id)).toEqual([2]);
    expect(applyDelete(list, 99)).toBe(list);
  });
  it('settleInsert: la provisoria toma su id real, y si realtime ya trajo la fila no queda repetida', () => {
    expect(settleInsert([e(1), e(-1)], -1, 8).map(x => x.id)).toEqual([1, 8]);
    expect(settleInsert([e(1), e(8), e(-1)], -1, 8).map(x => x.id)).toEqual([1, 8]);
  });
});

describe('liveError', () => {
  it('traduce los códigos del servidor', () => {
    expect(liveError('forbidden')).toContain('admins');
    expect(liveError('too_early')).toContain('2 horas');
    expect(liveError('too_late')).toContain('más de un día');
    expect(liveError('live_over')).toContain('resultado');
    expect(liveError('cancelled')).toContain('cancelado');
    expect(liveError('bad_state')).toContain('reloj');
    expect(liveError('Could not find the function public.live_clock')).toContain('habilitado');
    expect(liveError('TypeError: Failed to fetch')).toContain('Sin conexión');
    expect(liveError('algo raro')).toBe('algo raro');
  });
});
