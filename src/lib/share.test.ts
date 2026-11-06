import { describe, expect, it } from 'vitest';
import { buildIcs, calStamp, gcalUrl, icsEscape, icsFold, matchUrl, shareText, whatsappUrl, type ShareMatch } from './share';

const m: ShareMatch = { id: 'abc-123', title: 'Jueves, con amigos', starts_at: '2026-11-12T00:00:00Z', location: 'Cancha 5; Palermo', slots: 10 };
const url = matchUrl('https://futbol-rank.vercel.app', 'amigos', m.id);

describe('matchUrl', () => {
  it('arma el link a la pantalla del partido', () => {
    expect(url).toBe('https://futbol-rank.vercel.app/#/c/amigos/m/abc-123');
  });
});

describe('shareText', () => {
  it('incluye título, fecha, lugar, cupos y link, una cosa por línea', () => {
    const lines = shareText(m, 7, url).split('\n');
    expect(lines[0]).toBe('⚽ Jueves, con amigos');
    expect(lines[1].startsWith('📅 ')).toBe(true);
    expect(lines[1].endsWith(' hs')).toBe(true);
    expect(lines[2]).toBe('📍 Cancha 5; Palermo');
    expect(lines[3]).toBe('👥 7/10 anotados');
    expect(lines[4]).toBe(`Anotate acá: ${url}`);
  });
  it('sin lugar se saltea la línea del lugar', () => {
    const lines = shareText({ ...m, location: ' ' }, 0, url).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.some(l => l.startsWith('📍'))).toBe(false);
  });
  it('el link de WhatsApp lleva el texto codificado', () => {
    expect(whatsappUrl('a b\nc')).toBe('https://wa.me/?text=a%20b%0Ac');
  });
});

describe('Google Calendar', () => {
  it('lleva título, fechas UTC (1 hora), detalle y lugar', () => {
    const u = new URL(gcalUrl(m, url));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('⚽ Jueves, con amigos');
    expect(u.searchParams.get('dates')).toBe('20261112T000000Z/20261112T010000Z');
    expect(u.searchParams.get('details')).toContain(url);
    expect(u.searchParams.get('location')).toBe('Cancha 5; Palermo');
  });
  it('sin lugar no manda location', () => {
    expect(new URL(gcalUrl({ ...m, location: null }, url)).searchParams.has('location')).toBe(false);
  });
});

describe('.ics', () => {
  it('calStamp saca guiones, dos puntos y milisegundos', () => {
    expect(calStamp('2026-11-12T00:00:00.000Z')).toBe('20261112T000000Z');
  });
  it('escapa coma, punto y coma, barra y saltos de línea', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('no corta caracteres multibyte y cada línea mide a lo sumo 75 bytes', () => {
    const folded = icsFold('SUMMARY:' + '⚽é'.repeat(40));
    const enc = new TextEncoder();
    for (const l of folded.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + '⚽é'.repeat(40));
  });
  it('arma un evento con aviso 1 hora antes', () => {
    const ics = buildIcs(m, url, new Date('2026-11-06T12:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const flat = ics.replace(/\r\n /g, '');
    expect(flat).toContain('UID:abc-123@futbol-rank');
    expect(flat).toContain('DTSTAMP:20261106T120000Z');
    expect(flat).toContain('DTSTART:20261112T000000Z');
    expect(flat).toContain('DTEND:20261112T010000Z');
    expect(flat).toContain('SUMMARY:⚽ Jueves\\, con amigos');
    expect(flat).toContain('LOCATION:Cancha 5\\; Palermo');
    expect(flat).toContain('BEGIN:VALARM\r\nACTION:DISPLAY');
    expect(flat).toContain('TRIGGER:-PT1H\r\nEND:VALARM');
  });
});
