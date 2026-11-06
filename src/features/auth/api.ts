// Cuenta, sesión, invitaciones y la ficha propia: la única puerta a Supabase de esta funcionalidad.
// Tiran Error con el mensaje del servidor (las pantallas lo traducen).
import { must, sb, type Profile, type Stats } from '../../shared/supabase';
import { pushOff } from '../push/push';

// ---------- Sesión ----------

export async function signInWithPassword(email: string, password: string) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/**
 * Crea la cuenta. `existed`: el correo ya estaba registrado (Supabase no lo avisa: devuelve un usuario sin identidades).
 * `confirm`: hay que confirmar el correo antes de entrar.
 */
export async function signUp(email: string, password: string, name: string): Promise<{ existed: boolean; confirm: boolean }> {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(error.message);
  return { existed: !!data.user && !data.user.identities?.length, confirm: !data.session };
}

/** Va a Google y vuelve a la app (la página se va: solo vuelve acá si falla antes de salir). */
export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw new Error(error.message);
}

/** Cierra la sesión (antes da de baja los avisos de este dispositivo, si se puede). */
export async function signOut() {
  await pushOff().catch(() => {});
  await sb.auth.signOut();
}

/**
 * Avisa cuando entra o sale alguien. supabase-js emite SIGNED_IN también al volver a la pestaña:
 * `userId` sirve para ver si cambió el usuario. Devuelve la función para dejar de escuchar.
 */
export function onAuthChange(cb: (ev: 'in' | 'out', userId: string | undefined) => void): () => void {
  const { data } = sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_OUT') cb('out', undefined);
    else if (ev === 'SIGNED_IN') cb('in', session?.user.id);
  });
  return () => data.subscription.unsubscribe();
}

export interface Account { email: string; via: string; created: string; last: string | null }
/** Datos de la cuenta, de la sesión local (sin pedir nada al servidor). */
export async function loadAccount(): Promise<Account | null> {
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  const provs: string[] = (u.app_metadata?.providers as string[] | undefined) ?? [u.app_metadata?.provider ?? 'email'];
  const via = provs.map(p => (p === 'google' ? 'Google' : p === 'email' ? 'Email y contraseña' : p)).join(' · ');
  return { email: u.email || '—', via, created: u.created_at, last: u.last_sign_in_at ?? null };
}

// ---------- Invitaciones ----------

/** Nombre y miembros de la comunidad del link (null si el código no existe). */
export async function inviteInfo(code: string): Promise<{ name: string; members: number } | null> {
  const data = must(await sb.rpc('invite_info', { p_code: code }));
  return data?.[0] ?? null;
}
/** Me une a la comunidad y devuelve su slug. */
export async function joinCommunity(code: string): Promise<string> {
  return must(await sb.rpc('join_community', { p_code: code })).slug;
}

// ---------- Mi ficha ----------

export async function loadBaseStats(profileId: string): Promise<Stats | null> {
  return must(await sb.from('base_stats').select('rit,tir,pas,reg,def,fis').eq('profile_id', profileId).maybeSingle()) as Stats | null;
}

export type ProfileFields = Pick<Profile, 'name' | 'nickname' | 'shirt_number' | 'fav_team' | 'pos' | 'photo_url'>;
/** Guarda la autoevaluación y los datos del perfil (y lo marca como completo). */
export async function saveMyProfile(profileId: string, stats: Stats, fields: ProfileFields) {
  must(await sb.from('base_stats').upsert({ profile_id: profileId, ...stats, updated_at: new Date().toISOString() }));
  must(await sb.from('profiles').update({ ...fields, onboarded: true }).eq('id', profileId));
}
