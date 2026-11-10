import { describe, expect, it } from 'vitest';
import {
  INTENT_KEY, choiceFlags, clearIntent, defaultChoice, destinationAfterSetup, flagsChoice, needsRoleChoice, readIntent, roleErrorText, roleFlags, routeAfterSetup, writeIntent,
} from './roles';

const memStore = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('roles', () => {
  it('cada opción se traduce a los dos roles y viceversa', () => {
    expect(choiceFlags('player')).toEqual({ player: true, owner: false });
    expect(choiceFlags('owner')).toEqual({ player: false, owner: true });
    expect(choiceFlags('both')).toEqual({ player: true, owner: true });
    for (const c of ['player', 'owner', 'both'] as const) expect(flagsChoice(choiceFlags(c))).toBe(c);
    expect(flagsChoice({ player: false, owner: false })).toBeNull();
  });
  it('un perfil sin los campos (base sin migrar) es un jugador que ya eligió', () => {
    expect(roleFlags({})).toEqual({ player: true, owner: false });
    expect(needsRoleChoice({})).toBe(false);
    expect(needsRoleChoice({ role_chosen: true })).toBe(false);
    expect(needsRoleChoice({ role_chosen: false })).toBe(true);
    expect(roleFlags({ is_player: false, is_owner: true })).toEqual({ player: false, owner: true });
  });
  it('la intención de dueño va y viene del storage, y tolera que no haya storage', () => {
    const s = memStore();
    expect(readIntent(s)).toBeNull();
    writeIntent('owner', s);
    expect(s.getItem(INTENT_KEY)).toBe('owner');
    expect(readIntent(s)).toBe('owner');
    clearIntent(s);
    expect(readIntent(s)).toBeNull();
    expect(readIntent(memStore({ [INTENT_KEY]: 'cualquier cosa' }))).toBeNull();
    expect(() => { writeIntent('owner', null); clearIntent(null); }).not.toThrow();
    expect(readIntent(null)).toBeNull();
    const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
    expect(readIntent(roto)).toBeNull();
    expect(() => { writeIntent('owner', roto); clearIntent(roto); }).not.toThrow();
  });
  it('quién viene por la puerta de dueños arranca con "Dueño de cancha" marcado', () => {
    expect(defaultChoice('owner')).toBe('owner');
    expect(defaultChoice(null)).toBe('player');
  });
  it('adónde va al terminar: el dueño que no juega, o el que entró por la puerta de dueños, a su panel', () => {
    expect(destinationAfterSetup({ player: false, owner: true }, null)).toBe('duenio');
    expect(destinationAfterSetup({ player: true, owner: true }, 'owner')).toBe('duenio');
    expect(destinationAfterSetup({ player: true, owner: true }, null)).toBe('');
    expect(destinationAfterSetup({ player: true, owner: false }, 'owner')).toBe('');
    expect(destinationAfterSetup({ player: true, owner: false }, null)).toBe('');
  });
  it('quien entró por la puerta de dueños pero eligió solo "Jugador" no se queda en #/duenio; las invitaciones sí se respetan', () => {
    const player = { player: true, owner: false }, both = { player: true, owner: true }, owner = { player: false, owner: true };
    expect(routeAfterSetup(player, 'owner', '#/duenio')).toBe('');
    expect(routeAfterSetup(player, null, '#/duenio/abc')).toBe('');
    expect(routeAfterSetup(both, null, '#/duenio')).toBe('');
    expect(routeAfterSetup(player, null, '#/join/abc123')).toBeNull();
    expect(routeAfterSetup(player, 'owner', '#/')).toBeNull();
    expect(routeAfterSetup(player, null, '')).toBeNull();
    expect(routeAfterSetup(player, null, '#/duenios')).toBeNull();      // no es la ruta del panel
    expect(routeAfterSetup(owner, null, '#/join/abc123')).toBe('duenio');
    expect(routeAfterSetup(both, 'owner', '#/duenio')).toBe('duenio');
  });
  it('mensajes de error', () => {
    expect(roleErrorText(new Error('no_role'))).toMatch(/al menos una/);
    expect(roleErrorText(new Error('Could not find the function public.set_my_roles'))).toMatch(/todavía no está disponible/);
    expect(roleErrorText(undefined)).toMatch(/Probá de nuevo/);
  });
});
