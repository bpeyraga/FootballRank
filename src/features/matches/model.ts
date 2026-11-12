// Partidos: tipos y reglas puras (sin Supabase ni Preact). Lo usan api.ts, los hooks y las pantallas.
import type { Venue } from '../venues/maps';
import type { PaySignup } from './fees';
import type { LiveState } from './live';

export interface Match {
  id: string; community_id: string; title: string; starts_at: string; location: string | null;
  slots: number; status: 'open' | 'closed' | 'played' | 'cancelled';
  score_a: number | null; score_b: number | null; created_by: string;
  venue_id: string | null; venue?: Venue | null; // `venue` solo viene cuando se pide con select('*, venue:venues(...)')
  fee_total?: number | string | null; // costo de la cancha (null = sin cuota); numeric: la API puede devolverlo como string
  schedule_id?: string | null; // el partido fijo que la creó
  // Reloj del partido en vivo (live_clock). undefined = la base todavía no tiene las columnas; null = no se juega en vivo.
  live_state?: LiveState | null; live_half?: number | null; live_since?: string | null; live_elapsed?: number | null;
  // Formación elegida para cada equipo ("2-1-1", sin el arquero). null/undefined = la de siempre para esa cantidad.
  formation_a?: string | null; formation_b?: string | null;
}

/** Un partido de la lista, con lo necesario para los cupos, "Anotado/En espera" y las deudas. */
export type MatchListItem = Match & { taken: number; mine: Signup['status'] | null; match_signups: PaySignup[] };

export type Team = 'A' | 'B';
export interface Signup {
  profile_id: string; status: 'in' | 'waitlist' | 'out'; team: Team | null; created_at: string; absent: boolean; captain: boolean; paid_at: string | null;
  /** Puesto en la formación de su equipo (0 = arco). null/undefined = lo ubica la app. */
  slot?: number | null;
}
export interface Suspension { id: string; profile_id: string }
export interface Score { avg: number; n: number }
export interface Mvp { mine: string | null; tally: Map<string, number> }

export { fmtDate } from '../../shared/text';

export const STATUS: Record<Match['status'], string> =
  { open: 'Inscripción abierta', closed: 'Lista cerrada', played: 'Jugado', cancelled: 'Cancelado' };

/** Una lista abierta se cierra sola cuando llega la hora del partido (lo hace también el servidor al anotarse). */
export const statusLabel = (m: Pick<Match, 'status' | 'starts_at' | 'live_state'>) => {
  if (m.status === 'open' || m.status === 'closed') {
    if (m.live_state === 'running') return '🔴 En vivo';
    if (m.live_state === 'paused') return '🔴 En vivo (en pausa)';
    if (m.live_state === 'ended') return 'Terminó · falta confirmar el resultado';
  }
  return m.status === 'open' && new Date(m.starts_at) <= new Date() ? 'Lista cerrada (ya empezó)' : STATUS[m.status];
};

/** Suspensión activa: pendiente (sin partido) o de un partido abierto/cerrado que todavía no pasó (hasta 3 h después). */
export const isActiveSuspension = (x: { match: { status: string; starts_at: string } | null }, now = Date.now()) =>
  !x.match || ((x.match.status === 'open' || x.match.status === 'closed') && +new Date(x.match.starts_at) > now - 3 * 3600e3);

/** Próximos (hasta 3 h después de empezar, del más cercano al más lejano) e historial. */
export function splitUpcoming<T extends Pick<Match, 'status' | 'starts_at'>>(list: T[], now = Date.now()) {
  const limit = now - 3 * 3600e3;
  const upcoming = list.filter(m => m.status !== 'played' && m.status !== 'cancelled' && +new Date(m.starts_at) > limit).reverse();
  const past = list.filter(m => !upcoming.includes(m));
  return { upcoming, past };
}

/** Cómo queda la lista del partido vista por `meId`. */
export function roster(su: Signup[], meId: string) {
  const inList = su.filter(s => s.status === 'in');
  const wait = su.filter(s => s.status === 'waitlist');
  const mine = su.find(s => s.profile_id === meId && s.status !== 'out');
  const myTeam = mine?.status === 'in' && !mine.absent ? mine.team : null; // el ausente no califica ni vota
  return { inList, wait, mine, myTeam, hasTeams: inList.some(s => s.team) };
}

/** Aviso después de editar los cupos: quiénes bajaron a la lista de espera o subieron de ella. */
export function editNotice(inCount: number, waitCount: number, slots: number) {
  const over = inCount - slots;
  const promoted = Math.min(waitCount, Math.max(slots - inCount, 0));
  return over > 0 ? `Partido actualizado: ${over} pasaron a la lista de espera.`
    : promoted > 0 ? `Partido actualizado: ${promoted} ${promoted === 1 ? 'subió' : 'subieron'} de la lista de espera.`
    : 'Partido actualizado.';
}

/** Aviso al anotar a varios de una: cuántos entraron y cuántos quedaron en espera. */
export function addedNotice(added: number, freeSlots: number) {
  const waiting = Math.max(added - Math.max(freeSlots, 0), 0);
  return `${added === 1 ? '1 jugador anotado' : `${added} jugadores anotados`}${waiting ? ` (${waiting} en lista de espera)` : ''}`;
}

/** Traduce los errores del servidor (códigos de las RPC, RLS, red) a un mensaje para el usuario. */
export function matchError(m: string) {
  if (m.includes('self_vote')) return 'No te podés votar a vos mismo como MVP 😅';
  if (m.includes('not_in_match') || m.includes('bad_target')) return 'Ese jugador no jugó este partido.';
  if (m.includes('mvp_closed')) return 'La votación de la figura ya cerró.';
  if (m.includes('already_suspended')) return 'Ya está suspendido para el próximo partido.';
  if (m.includes('suspended')) return 'Está suspendido para este partido por ausencias.';
  if (m.includes('result_locked')) return 'El resultado ya está cargado: solo lo corrige quien lo cargó o un admin.';
  if (m.includes('bad_score')) return 'El resultado tiene que ser un número entre 0 y 99.';
  if (m.includes('not_played')) return 'Primero hay que cargar el resultado del partido.';
  if (m.includes('not_member')) return 'Esa persona ya no es miembro de la comunidad.';
  if (m.includes('already_started')) return 'El partido ya empezó: no podés bajarte. Avisale a un admin.';
  if (m.includes('not_editable')) return 'Solo se puede editar un partido con la lista abierta o cerrada.';
  if (m.includes('bad_title')) return 'El título tiene que tener entre 1 y 80 caracteres.';
  if (m.includes('bad_date')) return 'Elegí una fecha y hora válidas.';
  if (m.includes('bad_location')) return 'El lugar es demasiado largo (máximo 200 caracteres).';
  if (m.includes('bad_slots')) return 'Los cupos tienen que ser entre 2 y 40.';
  if (m.includes('bad_venue')) return 'Esa cancha no es de esta comunidad. Elegí otra.';
  if (m.includes('bad_formation') || m.includes('bad_lineup')) return 'La formación no es válida. Probá de nuevo.';
  if (/Could not find the function public\.set_lineup|set_lineup.*schema cache/i.test(m)) return 'Cambiar la formación todavía no está activo en el servidor. Avisale a quien administra la app.';
  if (m.includes('cancelled')) return 'El partido está cancelado.';
  if (m.includes('closed')) return 'La lista está cerrada.';
  if (m.includes('not_started')) return 'El partido todavía no empezó.';
  if (m.includes('not_teammate')) return 'Solo podés calificar a tu equipo.';
  if (m.includes('not_player')) return 'No jugaste este partido.';
  if (m.includes('forbidden') || m.includes('row-level security')) return 'No tenés permiso para hacer eso.';
  if (m.includes('violates check constraint') || m.includes('invalid input syntax')) return 'Revisá los datos: hay un valor inválido.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Sin conexión. Probá de nuevo.';
  return m;
}

/** El mensaje de cualquier cosa atrapada en un catch, ya traducido. */
export const errText = (e: unknown, fallback = 'Error de red') => matchError((e as { message?: string })?.message || fallback);
