// Comunidad: la única puerta a la base de esta funcionalidad (datos del grupo, miembros, jugadores sin cuenta,
// pedidos de "Soy yo" y portada). Todas tiran Error con el mensaje del servidor.
import { must, sb, type Stats } from '../../shared/supabase';
import { addPlayerParams, statsParams, updatePlayerParams, type PlayerValue } from './players';
import type { Claim, Community, Role } from './model';
import type { CrestDesign } from './crestCore';
import { crestJpeg, crestPng } from './crestRender';

const rpc = async (fn: string, args: Record<string, unknown>) => must(await sb.rpc(fn, args));

// ---------- Comunidad ----------

/** La comunidad por su slug (null si no existe o no soy miembro). */
export async function loadCommunity(slug: string): Promise<Community | null> {
  return must(await sb.from('communities').select('*').eq('slug', slug).maybeSingle()) as Community | null;
}

/** Mensajes de otros desde `since` (para el contador de la pestaña del chat). Si falla, 0. */
export async function countUnread(communityId: string, meId: string, since: string): Promise<number> {
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true })
    .eq('community_id', communityId).neq('author_id', meId).gt('created_at', since);
  return count ?? 0;
}

/** Link nuevo (el anterior deja de andar). Sin `hours` no vence (se manda solo p_community, como antes de existir p_hours). */
export const regenerateInvite = (communityId: string, hours: number | null) =>
  rpc('regenerate_invite', hours ? { p_community: communityId, p_hours: hours } : { p_community: communityId });

export const deleteCommunity = async (communityId: string) => { must(await sb.from('communities').delete().eq('id', communityId)); };

// ---------- Miembros ----------

export const setRole = (communityId: string, pid: string, role: Role) => rpc('set_role', { p_community: communityId, p_profile: pid, p_role: role });
export const transferOwnership = (communityId: string, pid: string) => rpc('transfer_ownership', { p_community: communityId, p_profile: pid });

/** Saca a un miembro (o me voy yo). Uno sin cuenta se borra también (si no está en otra comunidad), para no dejarlo huérfano. */
export async function removeMember(communityId: string, pid: string, noAccount = false) {
  if (noAccount) await rpc('remove_placeholder', { p_community: communityId, p_profile: pid });
  else must(await sb.from('memberships').delete().eq('community_id', communityId).eq('profile_id', pid));
}

// ---------- Jugadores sin cuenta ----------

/** Agrega varios de una; devuelve cuántos se agregaron. */
export async function addPlayers(communityId: string, players: unknown[]): Promise<number> {
  const data = await rpc('add_players', { p_community: communityId, p_players: players });
  return typeof data === 'number' ? data : players.length;
}
export const addPlayer = (communityId: string, v: PlayerValue) => rpc('add_player', addPlayerParams(communityId, v));
export const updatePlayer = (pid: string, communityId: string, v: PlayerValue) => rpc('update_player', updatePlayerParams(pid, communityId, v));
export const setPlayerStats = (pid: string, communityId: string, s: Stats) => rpc('set_player_stats', statsParams(pid, communityId, s));

// ---------- "Soy yo" ----------

/** ¿Ya pedí reclamar ese perfil? (si falla, no). */
export async function hasMyClaim(placeholderId: string, meId: string): Promise<boolean> {
  const { data } = await sb.from('claims').select('claimant_id').eq('placeholder_id', placeholderId).eq('claimant_id', meId).maybeSingle();
  return !!data;
}
export const requestClaim = (placeholderId: string) => rpc('request_claim', { p_placeholder: placeholderId });
/** Rechazar un pedido (owner) o cancelar el mío. */
export const rejectClaim = (placeholderId: string, claimantId: string) => rpc('reject_claim', { p_placeholder: placeholderId, p_claimant: claimantId });
export const approveClaim = (placeholderId: string, claimantId: string) => rpc('approve_claim', { p_placeholder: placeholderId, p_claimant: claimantId });
export async function pendingClaims(communityId: string): Promise<Claim[]> {
  return ((await rpc('pending_claims', { p_community: communityId })) ?? []) as Claim[];
}

// ---------- Portada ----------

/** Achica a 1600 px del lado más largo (sin recortar) y la sube como JPEG. Devuelve el link público. */
export async function uploadCommunityPhoto(communityId: string, file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.85));
  const path = `${communityId}/${crypto.randomUUID()}.jpg`;
  must(await sb.storage.from('communities').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('communities').getPublicUrl(path).data.publicUrl;
}

/** Cambia (o con null quita) la portada y borra la anterior del almacenamiento (si eso falla, no importa). */
export async function setCommunityPhoto(communityId: string, next: string | null, previous: string | null) {
  await rpc('set_community_photo', { p_community: communityId, p_url: next });
  const old = previous?.split('/communities/')[1]?.split('?')[0];
  if (old) await sb.storage.from('communities').remove([old]);
}

// ---------- Escudo ----------

/** Recorta al centro en cuadrado (hasta 320 px) y la sube como JPEG: va dentro de la forma del escudo. Devuelve el link público. */
export async function uploadCommunityLogo(communityId: string, file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height), out = Math.min(320, side);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  const blob = await new Promise<Blob>((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.88));
  const path = `${communityId}/logo-${crypto.randomUUID()}.jpg`;
  must(await sb.storage.from('communities').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('communities').getPublicUrl(path).data.publicUrl;
}

/** Ruta dentro del bucket a partir del link público. */
const storagePath = (url: string | null) => url?.split('/communities/')[1]?.split('?')[0];

/**
 * Cambia (o con null quita) la imagen del escudo y borra la anterior del almacenamiento (si eso falla, no importa).
 * Si no se pudo guardar, borra la recién subida para no dejarla huérfana.
 */
export async function setCommunityLogo(communityId: string, next: string | null, previous: string | null) {
  try {
    await rpc('set_community_logo', { p_community: communityId, p_url: next });
  } catch (e) {
    const fresh = storagePath(next);
    if (fresh) await sb.storage.from('communities').remove([fresh]).catch(() => {});
    throw e;
  }
  const old = storagePath(previous);
  if (old) await sb.storage.from('communities').remove([old]);
}

// ---------- Escudo diseñado ("Crear escudo") ----------

/** ¿La base todavía no tiene la función? (migración sin aplicar o esquema sin recargar). */
const missingFn = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /could not find the function|schema cache/i.test(e.message ?? '');

const publicUrl = (path: string) => sb.storage.from('communities').getPublicUrl(path).data.publicUrl;
const dropFile = (url: string | null) => {
  const p = storagePath(url);
  return p ? sb.storage.from('communities').remove([p]).then(() => {}, () => {}) : Promise.resolve();
};

/**
 * Guarda el escudo diseñado: lo dibuja en un PNG transparente de 512 px, lo sube a <comunidad>/crest-<uuid>.png y lo
 * deja como escudo junto con el diseño (para poder editarlo después). Borra el anterior (si eso falla, no importa) y, si
 * no se pudo guardar, el PNG recién subido.
 * Si la base todavía no tiene `set_community_crest` (migración sin aplicar), cae a un JPEG sobre el color de la comunidad
 * por el camino de siempre: se ve, pero sin forma propia y sin poder reeditar el diseño (`editable: false`).
 */
export async function saveCommunityCrest(
  communityId: string, design: CrestDesign, previous: string | null, background: string,
): Promise<{ editable: boolean }> {
  const png = await crestPng(design);
  const path = `${communityId}/crest-${crypto.randomUUID()}.png`;
  must(await sb.storage.from('communities').upload(path, png, { contentType: 'image/png' }));
  const url = publicUrl(path);
  const { error } = await sb.rpc('set_community_crest', { p_community: communityId, p_url: url, p_design: design });
  if (!error) { await dropFile(previous); return { editable: true }; }
  await dropFile(url);
  if (!missingFn(error)) throw new Error(error.message);
  const jpg = `${communityId}/logo-${crypto.randomUUID()}.jpg`;
  must(await sb.storage.from('communities').upload(jpg, await crestJpeg(design, background), { contentType: 'image/jpeg' }));
  await setCommunityLogo(communityId, publicUrl(jpg), previous);
  return { editable: false };
}
