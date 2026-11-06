import { sb } from './supabase';

export interface CustomRow { id: string; label: string; value: number; created_by: string; hidden: boolean }

/** Una stat de la casa agrupada por nombre: cada miembro que la puntúa aporta su valor. */
export interface HouseStat { key: string; label: string; avg: number | null; n: number; own: number | null; mine: number | null }

export async function loadCustom(communityId: string, pid: string): Promise<CustomRow[]> {
  const { data, error } = await sb.from('custom_stats').select('id,label,value,created_by,hidden')
    .eq('community_id', communityId).eq('target_id', pid).order('created_at');
  if (error) throw error;
  return data ?? [];
}

export const labelKey = (s: string) => s.trim().toLocaleLowerCase('es');

/**
 * Agrupa por nombre (sin distinguir mayúsculas). Las ocultas no cuentan.
 * avg: promedio de todos los que la puntuaron excepto el propio jugador; own: la que se puso él; mine: la mía.
 */
export function aggregateCustom(list: CustomRow[], pid: string, meId: string): HouseStat[] {
  const groups = new Map<string, CustomRow[]>();
  for (const c of list) {
    if (c.hidden) continue;
    const k = labelKey(c.label);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.entries()].map(([key, cs]) => {
    const others = cs.filter(c => c.created_by !== pid);
    return {
      key,
      label: cs[0].label.trim(),
      avg: others.length ? Math.round(others.reduce((t, c) => t + c.value, 0) / others.length) : null,
      n: others.length,
      own: cs.find(c => c.created_by === pid)?.value ?? null,
      mine: cs.find(c => c.created_by === meId)?.value ?? null,
    };
  }).sort((a, b) => (b.avg ?? b.own ?? 0) - (a.avg ?? a.own ?? 0) || a.label.localeCompare(b.label));
}

export const RADAR_MAX_HOUSE = 4;

/** Las stats de la casa que entran al radar: las más votadas (y después las más altas), hasta `max`. */
export function radarHouse(house: HouseStat[], max = RADAR_MAX_HOUSE): HouseStat[] {
  return house.filter(h => (h.avg ?? h.own) != null)
    .sort((a, b) => b.n - a.n || (b.avg ?? b.own ?? 0) - (a.avg ?? a.own ?? 0))
    .slice(0, max);
}
