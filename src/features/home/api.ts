// Inicio: la única puerta a la base de esta funcionalidad. Tiran Error con el mensaje del servidor si algo falla.
import { must, sb } from '../../shared/supabase';
import { slugify } from '../../app/router';
import { memberCounts, signupSummary, type MyComm, type Next, type SignupSummary } from './model';

/** ¿Es del equipo de la app? Se pregunta una sola vez por sesión (por usuario); ante cualquier error, no (el link queda oculto). */
let appAdmin: { uid: string; ok: Promise<boolean> } | null = null;
export function isAppAdmin(uid: string): Promise<boolean> {
  if (appAdmin?.uid !== uid) {
    const entry: { uid: string; ok: Promise<boolean> } = {
      uid,
      ok: Promise.resolve(sb.rpc('is_app_admin')).then(r => must(r) === true).catch(() => {
        // un error pasajero no se cachea: la próxima vez se vuelve a preguntar
        if (appAdmin === entry) appAdmin = null;
        return false;
      }),
    };
    appAdmin = entry;
  }
  return appAdmin.ok;
}

/** Mis comunidades, por nombre. */
export async function loadMyCommunities(meId: string): Promise<MyComm[]> {
  const data = must(await sb.from('memberships').select('role, community:communities(id,name,slug,photo_url,logo_url)').eq('profile_id', meId));
  const list = ((data ?? []) as any[]).filter(r => r.community) as MyComm[];
  return list.sort((a, b) => a.community.name.localeCompare(b.community.name));
}

/** Miembros por comunidad y próximos partidos (de todas, ordenados por fecha). Si falla, vacío. */
export async function loadOverview(communityIds: string[]): Promise<{ counts: Record<string, number>; upcoming: Next[] }> {
  const [m, x] = await Promise.all([
    sb.from('memberships').select('community_id').in('community_id', communityIds),
    sb.from('matches').select('id,community_id,title,starts_at,location,slots,status').in('community_id', communityIds)
      .in('status', ['open', 'closed']).gte('starts_at', new Date().toISOString()).order('starts_at'),
  ]);
  return { counts: memberCounts(m.data ?? []), upcoming: (x.data ?? []) as Next[] };
}

/** Anotados de un partido y si estoy (sin error: si falla, nadie). */
export async function loadSignupSummary(matchId: string, meId: string): Promise<SignupSummary> {
  const s = await sb.from('match_signups').select('profile_id,status').eq('match_id', matchId);
  return signupSummary((s.data ?? []) as { profile_id: string; status: string }[], meId);
}

/** Crea la comunidad y devuelve su slug (si el slug está ocupado, prueba con uno con sufijo al azar). */
export async function createCommunity(name: string): Promise<string> {
  const base = slugify(name) || 'comunidad';
  let slug = base.length >= 3 ? base : base + '-fc';
  let res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
  if (res.error?.code === '23505') { // slug ocupado
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    res = await sb.rpc('create_community', { p_name: name.trim(), p_slug: slug });
  }
  must(res);
  return slug;
}
