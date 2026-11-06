// Canchas: carga, alta y selección al crear/editar un partido.
import { sb } from '../../shared/supabase';
import { isMapsUrl, type Venue } from './maps';

/** Valor del <select> de cancha para "➕ Nueva cancha…" ('' = sin cancha guardada; otro valor = id de una cancha). */
export const NEW_VENUE = 'new';

/** Lo que el admin escribe al dar de alta una cancha. */
export interface VenueDraft { url: string; name: string; address: string; lat: number | null; lng: number | null }
export const emptyDraft = (): VenueDraft => ({ url: '', name: '', address: '', lat: null, lng: null });

export const VENUE_COLS = 'id,community_id,name,address,maps_url,lat,lng';

export async function loadVenues(communityId: string): Promise<Venue[]> {
  const { data, error } = await sb.from('venues').select(VENUE_COLS).eq('community_id', communityId).order('name');
  if (error) throw error;
  return (data ?? []) as Venue[];
}

/** Borra una cancha. Devuelve false si no había nada que borrar (ya la sacaron o no hay permiso). */
export async function deleteVenue(id: string): Promise<boolean> {
  const r = await sb.from('venues').delete().eq('id', id).select('id');
  if (r.error) throw r.error;
  return !!r.data?.length;
}

/** Datos válidos para dar de alta? (el nombre es lo único obligatorio) */
export const draftValid = (d: VenueDraft) => d.name.trim().length > 0 && d.name.trim().length <= 80 && d.address.trim().length <= 160;

export type Picked = { error: string } | { id: string | null; name: string | null; created: Venue | null };

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
