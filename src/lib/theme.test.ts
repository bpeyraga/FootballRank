import { describe, expect, it } from 'vitest';
import { bootOf, clubVars, contrast } from './theme';
import { KITS } from './teams';

describe('clubVars', () => {
  it('todos los clubes: acento legible sobre fondo claro y oscuro (≥ 4.5:1)', () => {
    for (const team of Object.keys(KITS)) {
      const v = clubVars(team)!;
      expect(contrast(v.c, '#f1f6f2'), `${team} claro`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.d, '#0e1712'), `${team} oscuro`).toBeGreaterThanOrEqual(4.5);
      expect(v.soft).toMatch(/^#[0-9a-f]{6}$/);
      expect(v.dsoft).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('bootOf', () => {
  it('club solo pone variables con la paleta club', () => {
    const club = clubVars(Object.keys(KITS)[0])!;
    expect(bootOf({ mode: 'auto', palette: 'pasion', club }).vars).toEqual({});
    const b = bootOf({ mode: 'dark', palette: 'club', club });
    expect(b.theme).toBe('dark'); expect(b.palette).toBe('club');
    expect(b.vars['--club']).toBe(club.c); expect(b.vars['--club-d-soft']).toBe(club.dsoft);
  });
  it('cancha y club sin equipo no ponen data-palette', () => {
    expect(bootOf({ mode: 'auto', palette: 'cancha' }).palette).toBeNull();
    expect(bootOf({ mode: 'auto', palette: 'club', club: null }).palette).toBeNull();
  });
});
