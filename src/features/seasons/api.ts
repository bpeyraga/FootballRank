// Temporadas: la única puerta a la base de esta funcionalidad. La lógica pura está en model.ts.
// Todas tiran Error con el mensaje del servidor (seasonError los traduce).
import { must, sb } from '../../shared/supabase';
import type { AwardKind, Season, SeasonAward, SeasonsData } from './model';

/** La tabla todavía no existe (migración sin aplicar) o PostgREST no la ve. */
const isMissingTable = (e: any) =>
  e?.code === 'PGRST205' || e?.code === '42P01' || /could not find the table|relation .* does not exist/i.test(e?.message ?? '');

/** Temporadas de la comunidad (la más nueva primero) y los premios de las cerradas. Sin la migración, devuelve vacío. */
export async function loadSeasons(communityId: string): Promise<SeasonsData> {
  const [s, a] = await Promise.all([
    sb.from('seasons').select('id,community_id,name,starts_on,ends_on,closed_at')
      .eq('community_id', communityId).order('starts_on', { ascending: false }),
    sb.from('season_awards').select('season_id,kind,profile_id,value,seasons!inner(community_id)')
      .eq('seasons.community_id', communityId),
  ]);
  for (const r of [s, a]) {
    if (!r.error) continue;
    if (isMissingTable(r.error)) return { seasons: [], awards: [] };
    throw new Error(r.error.message);
  }
  return {
    seasons: (s.data ?? []) as Season[],
    awards: ((a.data ?? []) as any[]).map(r => ({
      season_id: r.season_id, kind: r.kind as AwardKind, profile_id: r.profile_id, value: Number(r.value),
    })) as SeasonAward[],
  };
}

/** Abre una temporada (admins). `startsOn` es un día 'AAAA-MM-DD' de Argentina. Devuelve su id. */
export async function startSeason(communityId: string, name: string, startsOn: string): Promise<string> {
  return must(await sb.rpc('start_season', { p_community: communityId, p_name: name, p_starts: startsOn })) as string;
}

/** Cierra la temporada (hoy) y calcula los campeones (admins). Devuelve cuántos premios se dieron. */
export async function closeSeason(seasonId: string): Promise<number> {
  return Number(must(await sb.rpc('close_season', { p_season: seasonId })) ?? 0);
}

/** Borra la temporada y sus premios (admins). */
export async function deleteSeason(seasonId: string): Promise<void> {
  must(await sb.rpc('delete_season', { p_season: seasonId }));
}
