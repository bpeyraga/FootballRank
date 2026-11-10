// Comunidad: tipos y reglas puras (sin Supabase ni Preact). Lo de cargar jugadores está en players.ts.

export interface Community { id: string; name: string; slug: string; invite_code: string; owner_id: string; invite_expires_at?: string | null; photo_url?: string | null }
export type Role = 'owner' | 'admin' | 'member';

/** Un pedido de "Soy yo" sobre un jugador cargado a mano. */
export interface Claim {
  placeholder_id: string; placeholder_name: string;
  claimant_id: string; claimant_name: string; claimant_photo: string | null; created_at: string;
}

export const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };
/** Orden de la lista de miembros: owner, admins, el resto. */
export const ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** Aviso después de regenerar el link de invitación. */
export const regenNotice = (hours: number | null) =>
  `Link nuevo generado${hours ? ` (vence en ${hours === 24 ? '24 horas' : `${hours / 24} días`})` : ''}; el anterior ya no sirve`;

/** Traduce los errores de las acciones de admin. */
export function adminError(m: string) {
  if (m.includes('forbidden')) return 'No tenés permiso para hacer eso.';
  if (m.includes('not_member')) return 'Esa persona ya no es miembro de la comunidad.';
  if (m.includes('bad_target')) return 'No se le puede transferir a esa persona: tiene que ser otro miembro con cuenta.';
  if (m.includes('bad_hours')) return 'El vencimiento elegido no es válido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}
