import { sb } from '../../shared/supabase';
import { buildMatchHistory, normalizeSeries, type MatchApp, type MatchHistory, type MatchScore, type OvrPoint } from './historyCore';

// La lógica pura (tipos, series, partidos) vive en historyCore.ts para poder testearla sin variables de entorno.
export * from './historyCore';

const PAGE = 1000; // tope de filas por request de PostgREST

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** La tabla todavía no existe (migración sin aplicar) o PostgREST no la ve. */
const isMissingTable = (e: any) =>
  e?.code === 'PGRST205' || e?.code === '42P01' || /could not find the table|relation .* does not exist/i.test(e?.message ?? '');

export interface OvrHistory {
  /** false si la migración del historial todavía no está aplicada. */
  available: boolean;
  /** Un punto por día, de más viejo a más nuevo. */
  points: OvrPoint[];
}

const MAX_DAYS = 365;

/** Evolución del OVR de un jugador en una comunidad. Si la tabla no existe devuelve available=false en vez de fallar. */
export async function loadOvrHistory(communityId: string, profileId: string): Promise<OvrHistory> {
  const { data, error } = await sb.from('ovr_history').select('day,ovr,n_votes')
    .eq('community_id', communityId).eq('profile_id', profileId)
    .order('day', { ascending: false }).limit(MAX_DAYS);
  if (error) {
    if (isMissingTable(error)) return { available: false, points: [] };
    throw error;
  }
  return { available: true, points: normalizeSeries(data as any) };
}

/**
 * Partidos jugados por el jugador en la comunidad (los `limit` más recientes), con resultado G/E/P y el promedio de ★
 * que le dieron sus compañeros, más el promedio general de todos sus partidos.
 */
export async function loadMatchHistory(communityId: string, profileId: string, limit = 10): Promise<MatchHistory> {
  const [signups, scores] = await Promise.all([
    fetchAll<any>((a, b) => sb.from('match_signups')
      .select('match_id,team,matches!inner(title,starts_at,score_a,score_b,community_id,status)')
      .eq('profile_id', profileId).eq('status', 'in')
      .eq('matches.status', 'played').eq('matches.community_id', communityId)
      .order('match_id').range(a, b)),
    // match_scores no tiene comunidad: se trae todo lo del jugador que veo y se cruza con sus partidos de acá
    fetchAll<any>((a, b) => sb.from('match_scores').select('match_id,avg_score,n')
      .eq('profile_id', profileId).order('match_id').range(a, b)),
  ]);
  const apps: MatchApp[] = signups.map(r => {
    const m = Array.isArray(r.matches) ? r.matches[0] : r.matches;
    return { match_id: r.match_id, title: m?.title ?? 'Partido', starts_at: m?.starts_at ?? '', team: r.team,
      score_a: m?.score_a ?? null, score_b: m?.score_b ?? null };
  });
  const sc: MatchScore[] = scores.map(r => ({ match_id: r.match_id, avg: Number(r.avg_score), n: Number(r.n) }));
  return buildMatchHistory(apps, sc, limit);
}
