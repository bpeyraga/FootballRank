import { sb } from './supabase';
import type { PlayedMatch, PlayerEvent, Signup } from './playCore';

// Una sola carga por pantalla: los partidos jugados y sus anotados de la comunidad alcanzan para presentismo, logros,
// duplas y estadísticas del jugador. La lógica pura vive en playCore / achievements / duos / boards.
export * from "./playCore";

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

const loadMatches = (communityId: string) =>
  fetchAll<PlayedMatch>((a, b) => sb.from('matches').select('id,starts_at,score_a,score_b')
    .eq('community_id', communityId).eq('status', 'played').order('starts_at').order('id').range(a, b));

/** Anotados ('in') de todos los partidos jugados de la comunidad. */
const loadSignups = async (communityId: string): Promise<Signup[]> => {
  const rows = await fetchAll<any>((a, b) => sb.from('match_signups')
    .select('match_id,profile_id,team,absent,matches!inner(community_id,status)')
    .eq('status', 'in').eq('matches.status', 'played').eq('matches.community_id', communityId)
    .order('match_id').order('profile_id').range(a, b));
  return rows.map(r => ({ match_id: r.match_id, profile_id: r.profile_id, team: r.team ?? null, absent: !!r.absent }));
};

/** Veces que cada uno fue figura (empate en votos = figura los dos). */
export async function loadMvps(communityId: string): Promise<{ profile_id: string; times: number }[]> {
  const { data, error } = await sb.rpc('community_mvps', { p_community: communityId });
  if (error) throw error;
  return ((data ?? []) as any[]).map(r => ({ profile_id: r.profile_id, times: Number(r.times) }));
}

export interface PlayData {
  matches: PlayedMatch[];
  /** Anotados de TODOS los jugadores (para duplas). */
  signups: Signup[];
  /** Solo los del jugador. */
  events: PlayerEvent[];
  joinedAt: string | null;
  mvpTimes: number;
  /** Suspensiones del jugador: cumplidas (partido ya jugado) y activas (pendientes o de un partido que viene). */
  suspensions: { served: number; active: number } | null;
}

/** Todo lo que necesita el perfil de un jugador, en paralelo. Lo accesorio (figuras, suspensiones) no hace fallar la carga. */
export async function loadPlayData(communityId: string, profileId: string): Promise<PlayData> {
  const [matches, signups, events, member, susp, mvps] = await Promise.all([
    loadMatches(communityId),
    loadSignups(communityId),
    fetchAll<any>((a, b) => sb.from('match_events').select('id,match_id,kind,matches!inner(status)')
      .eq('community_id', communityId).eq('profile_id', profileId).eq('matches.status', 'played')
      .order('id').range(a, b)),
    sb.from('memberships').select('joined_at').eq('community_id', communityId).eq('profile_id', profileId).maybeSingle(),
    sb.from('suspensions').select('id, match:matches(status,starts_at)').eq('community_id', communityId).eq('profile_id', profileId),
    loadMvps(communityId).catch(() => []),
  ]);
  let suspensions: PlayData['suspensions'] = null;
  if (!susp.error) {
    const l = (susp.data ?? []) as any[];
    const m = (x: any) => Array.isArray(x.match) ? x.match[0] : x.match;
    const served = l.filter(x => m(x)?.status === 'played').length;
    // Misma regla que SuspensionNotice: pendiente (sin partido) o partido abierto/cerrado que todavía no pasó.
    const active = l.filter(x => !m(x) || ((m(x).status === 'open' || m(x).status === 'closed')
      && +new Date(m(x).starts_at) > Date.now() - 3 * 3600e3)).length;
    suspensions = { served, active };
  }
  return {
    matches, signups,
    events: events.map(e => ({ match_id: e.match_id, kind: e.kind })),
    joinedAt: member.data?.joined_at ?? null,
    mvpTimes: mvps.find(m => m.profile_id === profileId)?.times ?? 0,
    suspensions,
  };
}

export interface AttendanceData { matches: PlayedMatch[]; signups: Signup[]; joined: Map<string, string> }

/** Datos del ranking de presentismo: partidos, anotados y fecha de ingreso de cada miembro. */
export async function loadAttendanceData(communityId: string): Promise<AttendanceData> {
  const [matches, signups, members] = await Promise.all([
    loadMatches(communityId),
    loadSignups(communityId),
    sb.from('memberships').select('profile_id,joined_at').eq('community_id', communityId),
  ]);
  if (members.error) throw members.error;
  return { matches, signups, joined: new Map(((members.data ?? []) as any[]).map(r => [r.profile_id, r.joined_at])) };
}
