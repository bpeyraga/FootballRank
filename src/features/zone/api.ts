// Zona y ranking de la zona: la única puerta a la base de esta funcionalidad. Tiran Error con el mensaje del servidor.
// Las coordenadas de otros jugadores nunca llegan acá: zone_ranking devuelve etiqueta y una banda de distancia (< 2, 5, 10, 25 o 50 km) (ver la migración).
import { must, sb } from '../../shared/supabase';
import { MAX_RADIUS, normalizeZone, type ZoneDraft, type ZoneRow } from './model';

/** La migración todavía no se aplicó (la tabla o la función no existen o PostgREST no las ve). */
export const isMissingZone = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === 'PGRST205' || x?.code === 'PGRST202' || x?.code === '42P01' || x?.code === '42883'
    || /could not find the (table|function)|relation .* does not exist|function .* does not exist/i.test(x?.message ?? '');
};

/** Mi zona (null si no cargué ninguna o si la función todavía no está disponible). Es la única fila que puedo leer: RLS "solo el dueño". */
export async function loadMyZone(): Promise<ZoneDraft | null> {
  const { data, error } = await sb.from('player_zones').select('label,lat,lng,public').maybeSingle();
  if (error) {
    if (isMissingZone(error)) return null;
    throw new Error(error.message);
  }
  return data ? { label: data.label, lat: data.lat, lng: data.lng, public: !!data.public } : null;
}

/** Guarda mi zona (el servidor redondea de nuevo a 2 decimales). */
export async function saveMyZone(z: ZoneDraft): Promise<void> {
  const n = normalizeZone(z);
  if (!n) throw new Error('Elegí un lugar válido.');
  must(await sb.rpc('set_my_zone', { p_label: n.label, p_lat: n.lat, p_lng: n.lng, p_public: n.public }));
}

/** Quita mi zona: dejo de aparecer en el ranking de la zona. */
export async function clearMyZone(): Promise<void> {
  must(await sb.rpc('clear_my_zone'));
}

/**
 * Jugadores que decidieron aparecer, hasta MAX_RADIUS km de MI zona guardada (hasta 500: primero los votados, después los de mejor
 * promedio y por último los más cercanos). Una sola consulta: el radio chico se arma filtrando acá por banda de distancia,
 * con el OVR calculado en el cliente.
 */
export async function loadZoneRanking(): Promise<ZoneRow[]> {
  const data = must(await sb.rpc('zone_ranking', { p_km: MAX_RADIUS, p_limit: 500 }));
  return ((data ?? []) as ZoneRow[]).map(r => ({
    ...r,
    distance_band: Number(r.distance_band), n_votes: Number(r.n_votes), matches_played: Number(r.matches_played),
    goals: Number(r.goals), assists: Number(r.assists), mvps: Number(r.mvps), communities: Number(r.communities),
  }));
}
