// Inicio: tipos y reglas puras (sin Supabase ni Preact).

export interface Comm { id: string; name: string; slug: string; photo_url?: string | null; logo_url?: string | null }
/** Una comunidad mía y mi rol en ella. */
export interface MyComm { role: string; community: Comm }
export interface Next { id: string; community_id: string; title: string; starts_at: string; location: string | null; slots: number; status: string }
/** Anotados del próximo partido y si estoy adentro. */
export interface SignupSummary { taken: number; waiting: number; mine: 'in' | 'waitlist' | null }

export const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Miembro' };

/** Color de la carta según el OVR (misma regla que el ranking). */
export { tier as tierOf } from '../ranking/ranking';

/** Acepta el link completo (…/#/join/abc123) o solo el código. */
export const inviteCode = (s: string) => s.trim().match(/join\/([a-z0-9]+)/i)?.[1] ?? (/^[a-z0-9]{6,}$/i.test(s.trim()) ? s.trim() : null);

/** Cuántos miembros tiene cada comunidad (una fila por membresía). */
export function memberCounts(rows: { community_id: string }[]) {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.community_id] = (c[r.community_id] ?? 0) + 1;
  return c;
}

/** El primer partido de cada comunidad (la lista viene ordenada por fecha). */
export function nextByCommunity(upcoming: Next[]) {
  const n: Record<string, Next> = {};
  for (const r of upcoming) n[r.community_id] ??= r;
  return n;
}

export function signupSummary(rows: { profile_id: string; status: string }[], meId: string): SignupSummary {
  const mine = rows.find(r => r.profile_id === meId)?.status;
  return {
    taken: rows.filter(r => r.status === 'in').length,
    waiting: rows.filter(r => r.status === 'waitlist').length,
    mine: mine === 'in' || mine === 'waitlist' ? mine : null,
  };
}

export interface QuickAction { href: string; label: string; sub: string; d: string }

/**
 * Accesos rápidos: apuntan a la comunidad del próximo partido (o a la primera) y solo a pantallas que existen.
 * No incluye "Anotarme": ese botón ya es el del cartel de "Tu próximo partido" y repetirlo no suma.
 * `d` es el trazo del ícono.
 */
export function quickActions(hero: Next | null, comms: MyComm[] | null): QuickAction[] {
  const heroComm = hero ? comms?.find(r => r.community.id === hero.community_id) : undefined;
  const target = heroComm ?? comms?.[0];
  const adminOf = heroComm && heroComm.role !== 'member' ? heroComm : comms?.find(r => r.role !== 'member');
  const out: QuickAction[] = [];
  if (adminOf) out.push({ href: `#/c/${adminOf.community.slug}`, label: 'Crear partido', sub: adminOf.community.name, d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5' });
  if (target) {
    out.push({ href: `#/c/${target.community.slug}/ranking`, label: 'Ranking', sub: target.community.name, d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3' });
    out.push({ href: `#/c/${target.community.slug}/chat`, label: 'Chat', sub: target.community.name, d: 'M4 5h16v11H10l-4 4v-4H4zM8 9.5h8M8 12.5h5' });
  }
  return out;
}
