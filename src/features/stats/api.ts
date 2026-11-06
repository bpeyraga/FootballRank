// Estadísticas: la única puerta a la base de esta funcionalidad. La lógica pura vive en statsCore, historyCore,
// playCore y customStats (testeada sin variables de entorno). Todas tiran Error con el mensaje del servidor.
import { fetchAll, must, sb } from '../../shared/supabase';
import { isActiveSuspension } from '../matches/model';
import type { CustomRow } from './customStats';
import { normalizeSeries, type OvrHistory } from './historyCore';
import type { PlayedMatch, PlayerEvent, Signup } from './playCore';
import { aggregateStats, type Appearance, type MatchEvent, type PlayerStats } from './statsCore';

/** La tabla todavía no existe (migración sin aplicar) o PostgREST no la ve. */
const isMissingTable = (e: any) =>
  e?.code === 'PGRST205' || e?.code === '42P01' || /could not find the table|relation .* does not exist/i.test(e?.message ?? '');

/** En los joins, PostgREST puede devolver el padre como objeto o como lista de uno. */
const one = <T>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

// ---------- Goles y tarjetas ----------

/** Eventos de un partido, en orden de carga. */
export async function loadMatchEvents(matchId: string): Promise<MatchEvent[]> {
  return (must(await sb.from('match_events').select('*').eq('match_id', matchId).order('id')) ?? []) as MatchEvent[];
}

/** Estadísticas por jugador de una comunidad (solo partidos jugados). */
export async function loadCommunityStats(communityId: string): Promise<Map<string, PlayerStats>> {
  const [signups, events] = await Promise.all([
    fetchAll<any>((a, b) => sb.from('match_signups').select('match_id,profile_id,team,matches!inner(score_a,score_b,community_id,status)')
      .eq('status', 'in').eq('absent', false).eq('matches.status', 'played').eq('matches.community_id', communityId)
      .order('match_id').order('profile_id').range(a, b)),
    fetchAll<any>((a, b) => sb.from('match_events').select('id,profile_id,kind,matches!inner(status)')
      .eq('community_id', communityId).eq('matches.status', 'played')
      .order('id').range(a, b)),
  ]);
  const apps: Appearance[] = signups.map(r => {
    const m = one<any>(r.matches);
    return { match_id: r.match_id, profile_id: r.profile_id, team: r.team, score_a: m?.score_a ?? null, score_b: m?.score_b ?? null };
  });
  return aggregateStats(apps, events);
}

// ---------- Evolución del OVR ----------

const MAX_DAYS = 365;

/** Evolución del OVR de un jugador en una comunidad. Si la tabla no existe devuelve available=false en vez de fallar. */
export async function loadOvrHistory(communityId: string, profileId: string): Promise<OvrHistory> {
  const { data, error } = await sb.from('ovr_history').select('day,ovr,n_votes')
    .eq('community_id', communityId).eq('profile_id', profileId)
    .order('day', { ascending: false }).limit(MAX_DAYS);
  if (error) {
    if (isMissingTable(error)) return { available: false, points: [] };
    throw new Error(error.message);
  }
  return { available: true, points: normalizeSeries(data as any) };
}

// ---------- Presentismo, logros, duplas y figuras ----------

const loadMatches = (communityId: string) =>
  fetchAll<PlayedMatch>((a, b) => sb.from('matches').select('id,starts_at,score_a,score_b')
    .eq('community_id', communityId).eq('status', 'played').order('starts_at').order('id').range(a, b));

/** Anotados ('in') de todos los partidos jugados de la comunidad. */
async function loadSignups(communityId: string): Promise<Signup[]> {
  const rows = await fetchAll<any>((a, b) => sb.from('match_signups')
    .select('match_id,profile_id,team,absent,matches!inner(community_id,status)')
    .eq('status', 'in').eq('matches.status', 'played').eq('matches.community_id', communityId)
    .order('match_id').order('profile_id').range(a, b));
  return rows.map(r => ({ match_id: r.match_id, profile_id: r.profile_id, team: r.team ?? null, absent: !!r.absent }));
}

/** Veces que cada uno fue figura (empate en votos = figura los dos). */
export async function loadMvps(communityId: string): Promise<{ profile_id: string; times: number }[]> {
  const data = must(await sb.rpc('community_mvps', { p_community: communityId }));
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
    const l = ((susp.data ?? []) as any[]).map(x => ({ match: one<any>(x.match) ?? null }));
    suspensions = {
      served: l.filter(x => x.match?.status === 'played').length,
      active: l.filter(x => isActiveSuspension(x)).length,
    };
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
  return { matches, signups, joined: new Map(((must(members) ?? []) as any[]).map(r => [r.profile_id, r.joined_at])) };
}

// ---------- Stats de la casa ("Morfón 90"): las usan el perfil y la pantalla de votar ----------

const COLS = 'id,label,value,created_by,hidden,code';

/** Las stats de la casa de un jugador, en el orden en que se crearon. */
export async function loadCustom(communityId: string, pid: string): Promise<CustomRow[]> {
  return (must(await sb.from('custom_stats').select(COLS)
    .eq('community_id', communityId).eq('target_id', pid).order('created_at')) ?? []) as CustomRow[];
}

export interface NewCustom { communityId: string; targetId: string; meId: string; label: string; value: number; code?: string | null }
export async function addCustom(v: NewCustom) {
  must(await sb.from('custom_stats').insert({
    community_id: v.communityId, target_id: v.targetId, created_by: v.meId, label: v.label, value: v.value, hidden: false,
    ...(v.code !== undefined ? { code: v.code } : {}),
  }));
}
export async function updateCustom(id: string, patch: Partial<Pick<CustomRow, 'label' | 'value' | 'code' | 'hidden'>>) {
  must(await sb.from('custom_stats').update(patch).eq('id', id));
}
export async function deleteCustom(id: string) {
  must(await sb.from('custom_stats').delete().eq('id', id));
}
