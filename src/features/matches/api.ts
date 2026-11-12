// Partidos: la única puerta a la base para esta funcionalidad. Las pantallas no llaman a Supabase:
// usan estas funciones (directo o a través de un hook). Todas tiran Error con el mensaje del servidor si algo falla.
import { must, sb, type Profile } from '../../shared/supabase';
import { VENUE_COLS } from '../venues/api';
import { SCHEDULE_COLS, type Schedule } from './schedule';
import type { EventKind, MatchEvent } from '../stats/statsCore';
import type { LiveAction, LiveState } from './live';
import type { Match, MatchListItem, Mvp, Score, Signup, Suspension, Team } from './model';
import type { WeekEvent, WeekVote } from './weeklyCore';

const rpc = async (fn: string, args: Record<string, unknown>) => { must(await sb.rpc(fn, args)); };

// ---------- Lista de partidos ----------

/** Los últimos 100 partidos de la comunidad (absent y paid_at vienen juntos: de ahí salen las deudas). */
export async function loadMatchList(communityId: string, meId: string): Promise<MatchListItem[]> {
  const data = must(await sb.from('matches').select('*, match_signups(profile_id,status,absent,paid_at)')
    .eq('community_id', communityId).order('starts_at', { ascending: false }).limit(100));
  return (data ?? []).map((x: any) => ({
    ...x,
    taken: x.match_signups.filter((s: any) => s.status === 'in').length,
    mine: x.match_signups.find((s: any) => s.profile_id === meId && s.status !== 'out')?.status ?? null,
  }));
}

/** Goles, asistencias y votos de figura (por partido) de esos partidos: lo que necesita "Resumen de la semana". */
export async function loadWeekExtras(matchIds: string[]): Promise<{ events: WeekEvent[]; votes: WeekVote[] }> {
  if (!matchIds.length) return { events: [], votes: [] };
  const [e, v] = await Promise.all([
    sb.from('match_events').select('match_id,profile_id,kind').in('match_id', matchIds).in('kind', ['goal', 'assist']),
    sb.from('match_mvp').select('match_id,profile_id,votes').in('match_id', matchIds),
  ]);
  return { events: must(e) ?? [], votes: must(v) ?? [] };
}

export type ProfileName = Pick<Profile, 'id' | 'name' | 'nickname' | 'photo_url'>;
export async function loadProfileNames(ids: string[]): Promise<ProfileName[]> {
  return must(await sb.from('profiles').select('id,name,nickname,photo_url').in('id', ids)) ?? [];
}

export interface NewMatch { communityId: string; meId: string; title: string; startsAt: string; slots: number; venueId: string | null; location: string | null }
/** Crea la convocatoria y devuelve su id. */
export async function createMatch(v: NewMatch): Promise<string> {
  const data = must(await sb.from('matches').insert({
    community_id: v.communityId, created_by: v.meId, title: v.title, starts_at: v.startsAt, slots: v.slots,
    venue_id: v.venueId, location: v.location,
  }).select('id').single());
  return data!.id;
}

export interface PlayedMatch {
  communityId: string; title: string; startsAt: string; location: string | null; venueId: string | null;
  players: { id: string; team: Team | null }[]; a: number; b: number; events: { id: string; kind: EventKind }[];
}
/** "Cargar partido jugado": crea el partido ya jugado, con equipos, resultado y goles, de una sola vez. Devuelve su id. */
export async function loadPlayedMatch(v: PlayedMatch): Promise<string> {
  return must(await sb.rpc('load_played_match', {
    p_community: v.communityId, p_title: v.title, p_starts_at: v.startsAt, p_location: v.location, p_venue: v.venueId,
    p_players: v.players, p_a: v.a, p_b: v.b, p_events: v.events,
  })) as string;
}

// ---------- Un partido ----------

export interface MatchBundle { match: Match | null; signups: Signup[]; suspensions: Suspension[]; scores: Map<string, Score>; myRatings: Record<string, number> }

export async function loadMatch(id: string, meId: string): Promise<MatchBundle> {
  const [a, b, c, d, f] = await Promise.all([
    sb.from('matches').select(`*, venue:venues(${VENUE_COLS})`).eq('id', id).maybeSingle(),
    sb.from('match_signups').select('*').eq('match_id', id).order('created_at'),
    sb.from('match_scores').select('*').eq('match_id', id),
    sb.from('match_ratings').select('target_id,score').eq('match_id', id).eq('rater_id', meId),
    sb.from('suspensions').select('id,profile_id').eq('match_id', id),
  ]);
  return {
    match: must(a), signups: must(b) ?? [], suspensions: must(f) ?? [],
    scores: new Map((must(c) ?? []).map((x: any) => [x.profile_id, { avg: +x.avg_score, n: x.n }])),
    myRatings: Object.fromEntries((must(d) ?? []).map((x: any) => [x.target_id, x.score])),
  };
}

/** Mi voto de MVP y el conteo del partido. */
export async function loadMvp(id: string, meId: string): Promise<Mvp> {
  const [mine, tally] = await Promise.all([
    sb.from('mvp_votes').select('target_id').eq('match_id', id).eq('voter_id', meId).maybeSingle(),
    sb.from('match_mvp').select('profile_id,votes').eq('match_id', id),
  ]);
  return { mine: must(mine)?.target_id ?? null, tally: new Map((must(tally) ?? []).map((x: any) => [x.profile_id, x.votes])) };
}

export const signup = (id: string) => rpc('signup', { p_match: id });
/** Sin `pid` se baja uno mismo; con `pid` un admin saca a otro. */
export const leaveMatch = (id: string, pid?: string) => rpc('leave_match', pid ? { p_match: id, p_profile: pid } : { p_match: id });
export const addManyToMatch = (id: string, pids: string[]) => rpc('add_many_to_match', { p_match: id, p_profiles: pids });
export const setAbsent = (id: string, pid: string, absent: boolean) => rpc('set_absent', { p_match: id, p_profile: pid, p_absent: absent });
export const suspend = (communityId: string, pid: string, reason: string) => rpc('suspend', { p_community: communityId, p_profile: pid, p_reason: reason });
export const liftSuspension = async (suspensionId: string) => { must(await sb.from('suspensions').delete().eq('id', suspensionId)); };
export const setCaptain = (id: string, pid: string, on: boolean) => rpc('set_captain', { p_match: id, p_profile: pid, p_on: on });
export const setResult = (id: string, a: number, b: number) => rpc('set_result', { p_match: id, p_a: a, p_b: b });
export const rateTeammates = (id: string, scores: Record<string, number>) => rpc('rate_teammates', { p_match: id, p_scores: scores });
export const voteMvp = (id: string, pid: string) => rpc('vote_mvp', { p_match: id, p_target: pid });
export const setMatchStatus = async (id: string, status: 'open' | 'closed' | 'cancelled') => {
  must(await sb.from('matches').update({ status }).eq('id', id));
};

export interface MatchEdit { title: string; startsAt: string; location: string; slots: number; venueId: string | null }
export const updateMatch = (id: string, v: MatchEdit) => rpc('update_match', {
  p_match: id, p_title: v.title, p_starts_at: v.startsAt, p_location: v.location, p_slots: v.slots, p_venue: v.venueId,
});

/** Guarda los equipos armados (y saca los capitanes: se eligen de nuevo). */
export async function saveTeams(id: string, a: string[], b: string[]) {
  const ups = [...a.map(pid => [pid, 'A'] as const), ...b.map(pid => [pid, 'B'] as const)];
  const results = await Promise.all(ups.map(([pid, team]) =>
    sb.from('match_signups').update({ team, captain: false }).eq('match_id', id).eq('profile_id', pid)));
  results.forEach(r => must(r));
}

/**
 * Guarda la formación de un equipo y el puesto de cada jugador (`slots`: id → puesto, 0 = arco). Solo admins.
 * `formation` null = la de siempre para esa cantidad.
 */
export const setLineup = (id: string, team: Team, formation: string | null, slots: Record<string, number>) =>
  rpc('set_lineup', { p_match: id, p_team: team, p_formation: formation, p_slots: slots });

/** Borra el partido. Devuelve false si no se borró nada (sin permiso o ya no existía). */
export async function deleteMatch(id: string): Promise<boolean> {
  return !!must(await sb.from('matches').delete().eq('id', id).select('id'))?.length;
}

// ---------- Cuota de la cancha ----------

export const setPaid = (id: string, pid: string, paid: boolean) => rpc('set_paid', { p_match: id, p_profile: pid, p_paid: paid });
/** El paid_at guardado de un jugador (undefined si ya no está anotado). */
export async function loadPaidAt(id: string, pid: string): Promise<string | null | undefined> {
  const data = must(await sb.from('match_signups').select('paid_at').eq('match_id', id).eq('profile_id', pid).maybeSingle());
  return data ? data.paid_at : undefined;
}
export const setFee = (id: string, total: number | null) => rpc('set_fee', { p_match: id, p_total: total });

// ---------- Goles, faltas y tarjetas ----------

export interface NewEvent { match_id: string; community_id: string; profile_id: string; kind: EventKind; created_by: string; minute?: number }
/** Guarda un gol/asistencia/falta/tarjeta y devuelve su id (`minute` solo si se carga en vivo). */
export async function insertEvent(e: NewEvent): Promise<number> {
  return must(await sb.from('match_events').insert(e).select('id').single())!.id;
}
/** Devuelve false si no había nada que borrar (otro ya lo sacó). */
export async function deleteEvent(eventId: number): Promise<boolean> {
  return !!must(await sb.from('match_events').delete().eq('id', eventId).select('id'))?.length;
}

// ---------- Partido en vivo ----------

/** El reloj tal cual está en la base (`status` avisa si el partido cambió de estado: p. ej. otro admin cargó el resultado). */
export type LiveRow = Pick<Match, 'status' | 'live_state' | 'live_half' | 'live_since' | 'live_elapsed'>;
export async function loadLiveClock(id: string): Promise<LiveRow | null> {
  return must(await sb.from('matches').select('status,live_state,live_half,live_since,live_elapsed').eq('id', id).maybeSingle()) as LiveRow | null;
}

/** La hora del servidor (ISO): así todos ven el mismo cronómetro aunque el reloj del celular esté corrido. */
export async function liveNow(): Promise<string | null> {
  return must(await sb.rpc('live_now')) as string | null;
}

/** Lo que devuelve live_clock: el reloj como quedó y la hora del servidor. */
export interface LiveClockResult { live_state: LiveState | null; live_half: number | null; live_since: string | null; live_elapsed: number; now: string }
/** Maneja el reloj (solo admins). Tira Error con el código del servidor (`liveError` lo traduce). */
export async function liveClock(id: string, action: LiveAction): Promise<LiveClockResult> {
  const data = must(await sb.rpc('live_clock', { p_match: id, p_action: action }));
  if (!data) throw new Error('No se pudo.');
  return data as LiveClockResult;
}

export interface LiveEvents {
  /** Cambió la fila del partido (reloj, estado, resultado...). */
  match: (row: Partial<Match>) => void;
  eventAdded: (e: MatchEvent) => void;
  eventGone: (id: number) => void;
  /** Conectado; `again` = es una reconexión (puede haberse perdido algo mientras tanto). */
  connected: (again: boolean) => void;
}
export interface LiveChannel { close: () => void }

/** Escucha el partido: el reloj (UPDATE de matches) y los eventos que se cargan o se sacan. */
export function openLiveChannel(id: string, on: LiveEvents): LiveChannel {
  let connected = false;
  const ch = sb.channel(`match-${id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, pl => on.match(pl.new as Partial<Match>))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${id}` }, pl => on.eventAdded(pl.new as MatchEvent))
    // Los DELETE no se pueden filtrar por partido (solo traen el id): quien escucha ignora los ids que no están en su lista.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'match_events' }, pl => {
      const eid = (pl.old as { id?: number }).id;
      if (eid != null) on.eventGone(eid);
    })
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      on.connected(connected);
      connected = true;
    });
  return { close: () => { sb.removeChannel(ch); } };
}

// ---------- Tercer tiempo ----------

export async function loadBeers(id: string): Promise<Record<string, number>> {
  const data = must(await sb.from('match_beers').select('profile_id,beers').eq('match_id', id));
  return Object.fromEntries((data ?? []).map(r => [r.profile_id, r.beers as number]));
}
/** Total de cervezas de un jugador en la comunidad (para el perfil). */
export async function loadBeerTotal(communityId: string, pid: string): Promise<number> {
  const data = must(await sb.from('match_beers').select('beers').eq('community_id', communityId).eq('profile_id', pid));
  return (data ?? []).reduce((t, r) => t + r.beers, 0);
}
export const setBeers = (id: string, pid: string, beers: number) => rpc('set_beers', { p_match: id, p_profile: pid, p_beers: beers });

// ---------- Partido fijo ----------

export async function loadSchedules(communityId: string): Promise<Schedule[]> {
  return (must(await sb.from('match_schedules').select(SCHEDULE_COLS).eq('community_id', communityId)) ?? []) as Schedule[];
}
/** Pausa o reactiva. Devuelve el horario actualizado. */
export async function setScheduleActive(id: string, active: boolean): Promise<Schedule> {
  return must(await sb.from('match_schedules').update({ active }).eq('id', id).select(SCHEDULE_COLS).single()) as Schedule;
}
/** Devuelve false si no había nada que borrar. */
export async function deleteSchedule(id: string): Promise<boolean> {
  return !!must(await sb.from('match_schedules').delete().eq('id', id).select('id'))?.length;
}
/** Crea (sin `id`) o actualiza un horario. Devuelve cómo quedó guardado. */
export async function saveSchedule(payload: Record<string, unknown>, id: string | null, communityId: string, meId: string): Promise<Schedule> {
  const q = id
    ? sb.from('match_schedules').update(payload).eq('id', id)
    : sb.from('match_schedules').insert({ ...payload, community_id: communityId, created_by: meId, active: true });
  return must(await q.select(SCHEDULE_COLS).single()) as Schedule;
}
