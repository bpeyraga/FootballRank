import { describe, expect, it } from 'vitest';
import { addedNotice, editNotice, errText, matchError, roster, splitUpcoming, statusLabel, type Signup } from './model';

const s = (profile_id: string, status: Signup['status'], extra: Partial<Signup> = {}): Signup =>
  ({ profile_id, status, team: null, created_at: '', absent: false, captain: false, paid_at: null, ...extra });

describe('roster', () => {
  it('separa anotados, espera y lo mío', () => {
    const r = roster([s('a', 'in'), s('me', 'waitlist'), s('b', 'out'), s('c', 'in', { team: 'A' })], 'me');
    expect(r.inList.map(x => x.profile_id)).toEqual(['a', 'c']);
    expect(r.wait.map(x => x.profile_id)).toEqual(['me']);
    expect(r.mine?.status).toBe('waitlist');
    expect(r.myTeam).toBeNull();
    expect(r.hasTeams).toBe(true);
  });
  it('el que se bajó no cuenta como anotado', () => {
    expect(roster([s('me', 'out')], 'me').mine).toBeUndefined();
  });
  it('mi equipo solo si jugué (no ausente)', () => {
    expect(roster([s('me', 'in', { team: 'B' })], 'me').myTeam).toBe('B');
    expect(roster([s('me', 'in', { team: 'B', absent: true })], 'me').myTeam).toBeNull();
  });
});

describe('avisos', () => {
  it('al editar cupos', () => {
    expect(editNotice(12, 0, 10)).toBe('Partido actualizado: 2 pasaron a la lista de espera.');
    expect(editNotice(10, 3, 12)).toBe('Partido actualizado: 2 subieron de la lista de espera.');
    expect(editNotice(10, 1, 12)).toBe('Partido actualizado: 1 subió de la lista de espera.');
    expect(editNotice(8, 0, 10)).toBe('Partido actualizado.');
  });
  it('al anotar a varios', () => {
    expect(addedNotice(1, 3)).toBe('1 jugador anotado');
    expect(addedNotice(4, 2)).toBe('4 jugadores anotados (2 en lista de espera)');
    expect(addedNotice(2, -1)).toBe('2 jugadores anotados (2 en lista de espera)');
  });
});

describe('splitUpcoming', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const m = (id: string, status: any, h: number) => ({ id, status, starts_at: new Date(now + h * 3600e3).toISOString() });
  it('próximos del más cercano al más lejano; jugados, cancelados y viejos al historial', () => {
    const list = [m('lejos', 'open', 48), m('cerca', 'open', 2), m('recien', 'closed', -2), m('viejo', 'open', -4), m('jugado', 'played', 1), m('canc', 'cancelled', 5)];
    const { upcoming, past } = splitUpcoming(list, now);
    expect(upcoming.map(x => x.id)).toEqual(['recien', 'cerca', 'lejos']);
    expect(past.map(x => x.id)).toEqual(['viejo', 'jugado', 'canc']);
  });
});

describe('statusLabel', () => {
  it('lista abierta pasada la hora se ve cerrada', () => {
    expect(statusLabel({ status: 'open', starts_at: '2000-01-01T00:00:00Z' })).toBe('Lista cerrada (ya empezó)');
    expect(statusLabel({ status: 'played', starts_at: '2000-01-01T00:00:00Z' })).toBe('Jugado');
  });
});

describe('matchError', () => {
  it('traduce códigos del servidor', () => {
    expect(matchError('P0001: already_suspended')).toBe('Ya está suspendido para el próximo partido.');
    expect(matchError('suspended')).toBe('Está suspendido para este partido por ausencias.');
    expect(matchError('new row violates row-level security policy')).toBe('No tenés permiso para hacer eso.');
    expect(matchError('TypeError: Failed to fetch')).toBe('Sin conexión. Probá de nuevo.');
    expect(matchError('otra cosa')).toBe('otra cosa');
  });
  it('errText usa el mensaje o el texto por defecto', () => {
    expect(errText(new Error('closed'))).toBe('La lista está cerrada.');
    expect(errText(null, 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });
});
