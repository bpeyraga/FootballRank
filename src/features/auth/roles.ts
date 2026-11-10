// Roles de la persona (jugador, dueño de cancha o ambos) y la "intención" con la que entró por la landing. Lógica pura: sin red.

export type RoleChoice = 'player' | 'owner' | 'both';
export interface RoleFlags { player: boolean; owner: boolean }

export const ROLE_CARDS: { id: RoleChoice; title: string; desc: string }[] = [
  { id: 'player', title: 'Jugador', desc: 'Armá tu carta, votá a tus compañeros y organizá los partidos con tu grupo.' },
  { id: 'owner', title: 'Dueño de cancha', desc: 'Publicá tus canchas, manejá los turnos y recibí reservas desde la app.' },
  { id: 'both', title: 'Ambos', desc: 'Jugás y además tenés una cancha o un complejo. Una sola cuenta para las dos cosas.' },
];

export const choiceFlags = (c: RoleChoice): RoleFlags => ({ player: c !== 'owner', owner: c !== 'player' });
export const flagsChoice = (f: RoleFlags): RoleChoice | null => (f.player && f.owner ? 'both' : f.owner ? 'owner' : f.player ? 'player' : null);

type WithRoles = { is_player?: boolean; is_owner?: boolean; role_chosen?: boolean };
/** Roles de un perfil. Sin los campos (base sin la migración, datos viejos) se lo toma por jugador. */
export const roleFlags = (me: WithRoles): RoleFlags => ({ player: me.is_player !== false, owner: me.is_owner === true });
/** ¿Hay que preguntarle el rol? Solo cuando la base dice explícitamente que todavía no eligió. */
export const needsRoleChoice = (me: WithRoles): boolean => me.role_chosen === false;

// ---------- Intención de entrada ("¿Tenés una cancha?" en la landing) ----------
export type Intent = 'owner';
export const INTENT_KEY = 'fr-intent';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStore = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** La landing guarda que entró por la puerta de dueños; el primer ingreso la usa para preseleccionar "Dueño de cancha". */
export function readIntent(store: Store | null = browserStore()): Intent | null {
  try { return store?.getItem(INTENT_KEY) === 'owner' ? 'owner' : null; } catch { return null; }
}
export function writeIntent(intent: Intent, store: Store | null = browserStore()): void {
  try { store?.setItem(INTENT_KEY, intent); } catch { /* sin storage */ }
}
export function clearIntent(store: Store | null = browserStore()): void {
  try { store?.removeItem(INTENT_KEY); } catch { /* sin storage */ }
}

/** Rol que aparece marcado al abrir la pantalla de elección. */
export const defaultChoice = (intent: Intent | null): RoleChoice => (intent === 'owner' ? 'owner' : 'player');

/**
 * A dónde ir al terminar el alta: el dueño que no juega, o el que entró por la puerta de dueños, va directo a su panel;
 * el resto, al inicio de siempre.
 */
export const destinationAfterSetup = (f: RoleFlags, intent: Intent | null): 'duenio' | '' => (f.owner && (!f.player || intent === 'owner') ? 'duenio' : '');

/**
 * Ruta (sin "#/") a la que hay que ir al terminar el alta, o null para no tocar la actual.
 * Quien entró por la puerta de dueños tiene guardado "#/duenio" (main.tsx lo restaura al volver de Google): si en la elección resultó
 * que NO va a usar el panel (eligió solo "Jugador"), se lo saca de ahí. Otras rutas (ej. "#/join/…" de una invitación) no se tocan.
 */
export function routeAfterSetup(f: RoleFlags, intent: Intent | null, hash: string): string | null {
  const dest = destinationAfterSetup(f, intent);
  if (dest) return dest;
  return hash === '#/duenio' || hash.startsWith('#/duenio/') ? '' : null;
}

export function roleErrorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? '';
  if (/no_role/.test(msg)) return 'Elegí al menos una opción.';
  if (/PGRST202|Could not find the function|schema cache/.test(msg)) return 'Esta función todavía no está disponible. Probá de nuevo más tarde.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión. Revisala y probá de nuevo.';
  return msg ? `No pudimos guardar tu elección. ${msg}` : 'No pudimos guardar tu elección. Probá de nuevo.';
}
