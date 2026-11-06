import { describe, expect, it } from 'vitest';
import { byDay, chatError, dayLabel, merge, photoPath, reactionCounts, replaceReacts, snippet, splitLinks, withReaction, type Msg } from './model';

const msg = (id: number, created_at: string, extra: Partial<Msg> = {}): Msg => ({ id, author_id: 'a', body: 'x', created_at, ...extra });

describe('merge', () => {
  it('une por id, ordena por fecha y deja los pendientes al final', () => {
    const pend = msg(-5, '2026-11-06T10:00:00Z', { tmp: 't', status: 'sending' });
    const out = merge([msg(2, '2026-11-06T09:00:00Z'), pend], [msg(1, '2026-11-06T08:00:00Z'), msg(2, '2026-11-06T09:00:00Z', { body: 'nuevo' })]);
    expect(out.map(m => m.id)).toEqual([1, 2, -5]);
    expect(out[1].body).toBe('nuevo');
  });
  it('a igual fecha, por id', () => {
    expect(merge([], [msg(9, '2026-01-01T00:00:00Z'), msg(3, '2026-01-01T00:00:00Z')]).map(m => m.id)).toEqual([3, 9]);
  });
});

describe('byDay', () => {
  it('agrupa mensajes seguidos del mismo día', () => {
    const d = byDay([msg(1, '2026-11-05T12:00:00'), msg(2, '2026-11-05T13:00:00'), msg(3, '2026-11-06T12:00:00')]);
    expect(d.map(g => g.items.map(m => m.id))).toEqual([[1, 2], [3]]);
  });
});

describe('dayLabel', () => {
  const today = new Date(2026, 10, 6, 15);
  it('hoy y ayer', () => {
    expect(dayLabel(new Date(2026, 10, 6, 1), today)).toBe('Hoy');
    expect(dayLabel(new Date(2026, 10, 5, 23), today)).toBe('Ayer');
  });
  it('con año solo si no es este', () => {
    expect(dayLabel(new Date(2025, 10, 1), today)).toMatch(/2025/);
    expect(dayLabel(new Date(2026, 9, 1), today)).not.toMatch(/2026/);
  });
});

describe('textos', () => {
  it('snippet', () => {
    expect(snippet({ body: '  hola  ' })).toBe('hola');
    expect(snippet({ body: '', image_url: 'u' })).toBe('📷 Foto');
    expect(snippet({ body: 'a'.repeat(200) }).length).toBe(90);
  });
  it('links en posiciones impares, sin la puntuación final', () => {
    expect(splitLinks('mirá https://x.com/a. dale')).toEqual(['mirá ', 'https://x.com/a', '. dale']);
  });
  it('chatError', () => {
    expect(chatError('new row violates row-level security policy')).toMatch(/permiso/);
    expect(chatError('TypeError: Failed to fetch')).toBe('Sin conexión. Probá de nuevo.');
    expect(chatError('relation "messages" does not exist')).toMatch(/no está habilitado/);
    expect(chatError('otra')).toBe('otra');
  });
  it('photoPath', () => {
    expect(photoPath('https://p.supabase.co/storage/v1/object/public/chat/c1/u1/a%20b.jpg?x=1')).toBe('c1/u1/a b.jpg');
    expect(photoPath('blob:abc')).toBeNull();
    expect(photoPath(null)).toBeNull();
  });
});

describe('reacciones', () => {
  it('poner, cambiar y sacar', () => {
    let r = withReaction({}, 1, 'me', '👍');
    r = withReaction(r, 1, 'otro', '👍');
    expect(reactionCounts(r[1])).toEqual([['👍', 2]]);
    r = withReaction(r, 1, 'me', '😂');
    expect(reactionCounts(r[1])).toEqual([['😂', 1], ['👍', 1]]); // en el orden de quién reaccionó primero
    r = withReaction(r, 1, 'me', null);
    expect(r[1]).toEqual({ otro: '👍' });
  });
  it('replaceReacts pisa solo esos mensajes', () => {
    const prev = { 1: { a: '👍' }, 2: { b: '🔥' } };
    expect(replaceReacts(prev, [1], [{ message_id: 1, profile_id: 'c', emoji: '😂' }])).toEqual({ 1: { c: '😂' }, 2: { b: '🔥' } });
    expect(replaceReacts(prev, [2], [])).toEqual({ 1: { a: '👍' } });
  });
});
