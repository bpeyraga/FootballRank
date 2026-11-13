// Cuenta, sesión, invitaciones y la ficha propia: la única puerta a Supabase de esta funcionalidad.
// Tiran Error con el mensaje del servidor (las pantallas lo traducen).
import { clearOfflineData } from '../../shared/offline';
import { must, sb, type Profile, type Stats } from '../../shared/supabase';
import { pushOff } from '../push/push';
import { parseChallenge, type PowChallenge, type PowSolution } from './pow';

/** Desafío anti-bots para el registro (pow_challenge). null si la base no lo tiene o falla: el alta sigue sin él. */
export async function getPowChallenge(): Promise<PowChallenge | null> {
  try {
    const { data, error } = await sb.rpc('pow_challenge');
    return error ? null : parseChallenge(data);
  } catch { return null; }
}

// ---------- Sesión ----------

/** Mi perfil (null sin sesión). */
export async function loadMe(): Promise<Profile | null> {
  // getSession lee la sesión guardada (sin ir a la red): un corte de conexión no te "desloguea".
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  // Con sesión pero sin perfil (usuario creado antes del trigger): no mostrar el login en loop.
  if (!data) throw new Error('No encontramos tu perfil de jugador. Salí y volvé a entrar; si sigue pasando, avisale al admin.');
  return data;
}

/** Anota en la cuenta que ya vio el tutorial (para no mostrárselo en otro dispositivo). Sin esperar ni romper nada si falla. */
export async function markTourSeen(): Promise<void> {
  try { await sb.rpc('mark_tour_seen'); } catch { /* silencioso: queda el aviso local */ }
}

/** Id de quien tiene la sesión guardada en este navegador (sin ir a la red), o undefined. */
export async function sessionUserId(): Promise<string | undefined> {
  return (await sb.auth.getSession()).data.session?.user.id;
}

/** La última elección de cookies de la cuenta para esa versión del aviso (my_consent). Lanza si falla. */
export async function loadMyConsent(version: number): Promise<unknown> {
  const { data, error } = await sb.rpc('my_consent', { p_version: version });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/**
 * Crea la cuenta. `existed`: el correo ya estaba registrado (Supabase no lo avisa: devuelve un usuario sin identidades).
 * `confirm`: hay que confirmar el correo antes de entrar.
 */
export async function signUp(email: string, password: string, name: string, pow?: PowSolution | null): Promise<{ existed: boolean; confirm: boolean }> {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name, ...(pow ? { pow } : {}) }, emailRedirectTo: location.origin + location.pathname },
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
  await clearOfflineData(); // las lecturas guardadas para uso sin conexión son datos privados de esta cuenta
  await sb.auth.signOut();
}

/**
 * Avisa cuando entra o sale alguien. supabase-js emite SIGNED_IN también al volver a la pestaña:
 * `userId` sirve para ver si cambió el usuario. Devuelve la función para dejar de escuchar.
 */
export function onAuthChange(cb: (ev: 'in' | 'out', userId: string | undefined) => void): () => void {
  const { data } = sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_OUT') { void clearOfflineData(); cb('out', undefined); } // también si cerró en otra pestaña o venció la sesión
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
  return must(await sb.from('base_stats').select('rit,tir,pas,reg,def,fis,arq').eq('profile_id', profileId).maybeSingle()) as Stats | null;
}

export type ProfileFields = Pick<Profile, 'name' | 'nickname' | 'shirt_number' | 'fav_team' | 'pos' | 'photo_url'>;
/** Guarda la autoevaluación y los datos del perfil (y lo marca como completo). */
export async function saveMyProfile(profileId: string, stats: Stats, fields: ProfileFields) {
  must(await sb.from('base_stats').upsert({ profile_id: profileId, ...stats, updated_at: new Date().toISOString() }));
  must(await sb.from('profiles').update({ ...fields, onboarded: true }).eq('id', profileId));
}

// ---------- Mi foto ----------

/** Recorta al centro y exporta 256×256 JPEG (igual que la app v1). */
export async function cropPhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
  return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('crop'))), 'image/jpeg', 0.85));
}

export async function uploadPhoto(profileId: string, file: File): Promise<string> {
  const blob = await cropPhoto(file);
  const path = `${profileId}/avatar.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  return `${sb.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

// ---------- Rol: jugador, dueño de cancha o ambos ----------

/** Guarda qué usa la persona (al menos uno de los dos). Un dueño que no juega queda con la ficha "completa" (no tiene ficha de jugador). */
export async function setMyRoles(player: boolean, owner: boolean) {
  must(await sb.rpc('set_my_roles', { p_player: player, p_owner: owner }));
}
