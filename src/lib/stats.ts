import { sb } from './supabase';
import { aggregateStats, emptyStats, type Appearance, type MatchEvent, type PlayerStats } from './statsCore';

// La lógica pura (tipos, agregación, tablas) vive en statsCore.ts para poder testearla sin variables de entorno.
export * from './statsCore';

const PAGE = 1000; // tope de filas por request de PostgREST

/** Trae todas las páginas de una consulta (el orden tiene que ser estable). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Eventos de un partido, en orden de carga. */
export async function loadMatchEvents(matchId: string): Promise<MatchEvent[]> {
  const { data, error } = await sb.from('match_events').select('*').eq('match_id', matchId).order('id');
  if (error) throw error;
  return (data ?? []) as MatchEvent[];
}

/** Estadísticas por jugador de una comunidad (solo partidos jugados). Con profileId trae solo a ese jugador. */
export async function loadCommunityStats(communityId: string, profileId?: string): Promise<Map<string, PlayerStats>> {
  const [signups, events] = await Promise.all([
    fetchAll<any>((a, b) => {
      let q = sb.from('match_signups').select('match_id,profile_id,team,matches!inner(score_a,score_b,community_id,status)')
        .eq('status', 'in').eq('matches.status', 'played').eq('matches.community_id', communityId);
      if (profileId) q = q.eq('profile_id', profileId);
      return q.order('match_id').order('profile_id').range(a, b);
    }),
    fetchAll<any>((a, b) => {
      let q = sb.from('match_events').select('id,profile_id,kind,matches!inner(status)')
        .eq('community_id', communityId).eq('matches.status', 'played');
      if (profileId) q = q.eq('profile_id', profileId);
      return q.order('id').range(a, b);
    }),
  ]);
  const apps: Appearance[] = signups.map(r => {
    const m = Array.isArray(r.matches) ? r.matches[0] : r.matches;
    return { match_id: r.match_id, profile_id: r.profile_id, team: r.team, score_a: m?.score_a ?? null, score_b: m?.score_b ?? null };
  });
  return aggregateStats(apps, events);
}

export async function loadPlayerStats(communityId: string, profileId: string): Promise<PlayerStats> {
  return (await loadCommunityStats(communityId, profileId)).get(profileId) ?? emptyStats();
}
