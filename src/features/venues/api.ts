// Canchas: la única puerta a la base de esta funcionalidad. Tiran Error con el mensaje del servidor.
import { must, sb } from '../../shared/supabase';
import { isMapsUrl, type Venue } from './maps';
import { NEW_VENUE, type Picked, type VenueDraft } from './venues';

export const VENUE_COLS = 'id,community_id,name,address,maps_url,lat,lng';

export async function loadVenues(communityId: string): Promise<Venue[]> {
  return (must(await sb.from('venues').select(VENUE_COLS).eq('community_id', communityId).order('name')) ?? []) as Venue[];
}

/** Cambia nombre y dirección. Devuelve null si ya no existe (la sacaron o no hay permiso). */
export async function updateVenue(id: string, name: string, address: string | null): Promise<Venue | null> {
  return must(await sb.from('venues').update({ name, address }).eq('id', id).select(VENUE_COLS).maybeSingle()) as Venue | null;
}

/** Borra una cancha. Devuelve false si no había nada que borrar (ya la sacaron o no hay permiso). */
export async function deleteVenue(id: string): Promise<boolean> {
  return !!must(await sb.from('venues').delete().eq('id', id).select('id'))?.length;
}

/** Nombre y coordenadas de un link corto de Google Maps (lo resuelve la función `place` del servidor). */
export async function resolvePlace(url: string): Promise<{ name: string | null; lat: number | null; lng: number | null }> {
  const { data, error } = await sb.functions.invoke('place', { body: { url } });
  if (error || !data) throw error ?? new Error('sin respuesta');
  return { name: data.name ?? null, lat: data.lat ?? null, lng: data.lng ?? null };
}

/**
 * Resuelve la cancha elegida en el formulario: ninguna, una guardada o una nueva (se inserta acá).
 * `name` es el nombre para guardar también en matches.location (los avisos y el texto de compartir lo usan).
 */
export async function pickVenue(sel: string, draft: VenueDraft, venues: Venue[], communityId: string, meId: string): Promise<Picked> {
  if (!sel) return { id: null, name: null, created: null };
  if (sel !== NEW_VENUE) {
    const v = venues.find(x => x.id === sel);
    return v ? { id: v.id, name: v.name, created: null } : { error: 'Esa cancha ya no existe. Elegí otra.' };
  }
  const url = draft.url.trim();
  const { data, error } = await sb.from('venues').insert({
    community_id: communityId, created_by: meId, name: draft.name.trim(),
    address: draft.address.trim() || null, maps_url: isMapsUrl(url) ? url : null, lat: draft.lat, lng: draft.lng,
  }).select(VENUE_COLS).single();
  if (error) return { error: error.message.includes('row-level security') ? 'No tenés permiso para guardar canchas.' : error.message };
  return { id: data.id, name: data.name, created: data as Venue };
}
