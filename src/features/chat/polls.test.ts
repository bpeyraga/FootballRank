import { describe, expect, it } from 'vitest';
import {
  addVote, groupVotes, pollError, pollSnippet, removeVote, replaceVotes, setMine, tally, toggleChoice, validatePoll, votesLabel,
  type PollVote, type Votes,
} from './polls';

const v = (poll_id: string, profile_id: string, option: number): PollVote => ({ poll_id, profile_id, option });

describe('groupVotes', () => {
  it('agrupa por encuesta y perfil, ordena y no repite', () => {
    const g = groupVotes([v('p1', 'a', 2), v('p1', 'a', 0), v('p1', 'b', 1), v('p2', 'a', 1), v('p1', 'a', 2)]);
    expect(g).toEqual({ p1: { a: [0, 2], b: [1] }, p2: { a: [1] } });
  });
});

describe('replaceVotes', () => {
  const prev: Votes = { p1: { a: [0] }, p2: { a: [1] }, p3: { b: [2] } };
  it('pisa las encuestas pedidas y borra las que ya no tienen votos', () => {
    const next = replaceVotes(prev, ['p1', 'p2'], [v('p1', 'b', 1), v('p3', 'z', 0)]);
    expect(next).toEqual({ p1: { b: [1] }, p3: { b: [2] } });
  });
  it('respeta las encuestas con un voto mío en vuelo', () => {
    const next = replaceVotes(prev, ['p1', 'p2'], [v('p1', 'b', 1)], new Set(['p1']));
    expect(next.p1).toEqual({ a: [0] });
    expect(next.p2).toBeUndefined();
  });
  it('no muta el original', () => {
    replaceVotes(prev, ['p1'], []);
    expect(prev.p1).toEqual({ a: [0] });
  });
});

describe('addVote / removeVote (tiempo real)', () => {
  it('suma un voto y es idempotente', () => {
    const a = addVote({}, v('p1', 'a', 1));
    expect(a).toEqual({ p1: { a: [1] } });
    expect(addVote(a, v('p1', 'a', 1))).toBe(a);
    expect(addVote(a, v('p1', 'a', 0))).toEqual({ p1: { a: [0, 1] } });
  });
  it('saca un voto por su clave y es idempotente', () => {
    const base: Votes = { p1: { a: [0, 1], b: [1] } };
    expect(removeVote(base, v('p1', 'a', 0))).toEqual({ p1: { a: [1], b: [1] } });
    expect(removeVote(base, v('p1', 'b', 1))).toEqual({ p1: { a: [0, 1] } });
    expect(removeVote(base, v('p1', 'a', 5))).toBe(base);
    expect(removeVote(base, v('otra', 'a', 0))).toBe(base);
  });
  it('un reemplazo del servidor (borrar todo y volver a insertar) termina igual', () => {
    let s: Votes = { p1: { a: [0, 1] } };
    s = removeVote(removeVote(s, v('p1', 'a', 0)), v('p1', 'a', 1));
    s = addVote(addVote(addVote(s, v('p1', 'a', 0)), v('p1', 'a', 1)), v('p1', 'a', 2));
    expect(s).toEqual({ p1: { a: [0, 1, 2] } });
  });
});

describe('setMine', () => {
  it('reemplaza mis votos sin tocar los de otros', () => {
    expect(setMine({ p1: { a: [0], b: [1] } }, 'p1', 'a', [2, 1])).toEqual({ p1: { a: [1, 2], b: [1] } });
  });
  it('lista vacía = sacar mi voto', () => {
    expect(setMine({ p1: { a: [0], b: [1] } }, 'p1', 'a', [])).toEqual({ p1: { b: [1] } });
    expect(setMine({}, 'p1', 'a', [])).toEqual({ p1: {} });
  });
});

describe('toggleChoice', () => {
  it('una sola respuesta: tocar otra mueve el voto, tocar la misma lo saca', () => {
    expect(toggleChoice([], 1, false)).toEqual([1]);
    expect(toggleChoice([1], 2, false)).toEqual([2]);
    expect(toggleChoice([1], 1, false)).toEqual([]);
  });
  it('varias respuestas: prende y apaga cada opción', () => {
    expect(toggleChoice([], 2, true)).toEqual([2]);
    expect(toggleChoice([2], 0, true)).toEqual([0, 2]);
    expect(toggleChoice([0, 2], 2, true)).toEqual([0]);
    expect(toggleChoice([0], 0, true)).toEqual([]);
  });
});

describe('tally', () => {
  const poll = { options: ['Jueves', 'Viernes', 'Sábado'] };
  it('cuenta votos, votantes y porcentajes', () => {
    const t = tally(poll, { a: [0], b: [0, 1], c: [1] });
    expect(t.voters).toBe(3);
    expect(t.counts).toEqual([2, 2, 0]);
    expect(t.by[0]).toEqual(['a', 'b']);
    expect(t.pct).toEqual([67, 67, 0]);
  });
  it('sin votos todo en cero', () => {
    expect(tally(poll, undefined)).toEqual({ voters: 0, counts: [0, 0, 0], by: [[], [], []], pct: [0, 0, 0] });
  });
  it('ignora opciones que no existen', () => {
    const t = tally(poll, { a: [7], b: [2] });
    expect(t.voters).toBe(1);
    expect(t.counts).toEqual([0, 0, 1]);
  });
});

describe('textos', () => {
  it('votesLabel', () => {
    expect(votesLabel(0)).toBe('0 votos');
    expect(votesLabel(1)).toBe('1 voto');
    expect(votesLabel(12)).toBe('12 votos');
  });
  it('pollSnippet cita con el 📊', () => {
    expect(pollSnippet('  ¿Quién juega?  ')).toBe('📊 ¿Quién juega?');
    expect(pollSnippet('x'.repeat(200))).toHaveLength(90);
  });
  it('pollError traduce los errores de la base', () => {
    expect(pollError('bad_options')).toMatch(/entre 2 y 8/);
    expect(pollError('bad_question')).toMatch(/pregunta/);
    expect(pollError('single_choice')).toMatch(/una sola/);
    expect(pollError('bad_option')).toMatch(/ya no existe/);
    expect(pollError('forbidden')).toMatch(/permiso/);
    expect(pollError('Could not find the function public.vote_poll in the schema cache')).toMatch(/todavía no están habilitadas/);
    expect(pollError('algo raro')).toBe('algo raro');
  });
});

describe('validatePoll', () => {
  it('arma la encuesta limpia', () => {
    const f = validatePoll('  ¿Quién se suma?  ', [' Yo ', '', 'Yo no', '   ']);
    expect(f).toEqual({ ok: true, question: '¿Quién se suma?', options: ['Yo', 'Yo no'], hint: '' });
  });
  it('pide pregunta y al menos 2 opciones', () => {
    expect(validatePoll('', ['a', 'b']).ok).toBe(false);
    expect(validatePoll('¿?', ['a', '']).ok).toBe(false);
  });
  it('máximo 8 opciones, 60 letras cada una y 140 la pregunta', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `op${i}`);
    expect(validatePoll('¿?', nine).ok).toBe(false);
    expect(validatePoll('¿?', nine.slice(0, 8)).ok).toBe(true);
    expect(validatePoll('¿?', ['a', 'b'.repeat(61)]).ok).toBe(false);
    expect(validatePoll('¿?', ['a', 'b'.repeat(60)]).ok).toBe(true);
    expect(validatePoll('q'.repeat(141), ['a', 'b']).ok).toBe(false);
  });
  it('avisa de opciones repetidas', () => {
    const f = validatePoll('¿?', ['Sí', 'sí']);
    expect(f.ok).toBe(false);
    expect(f.hint).toMatch(/repetidas/);
  });
});
